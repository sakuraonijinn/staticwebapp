const crypto = require('crypto');

module.exports = async function (context, req) {
    context.log('APS endpoint processing request');
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-APS-Token'
    };

    if (req.method === 'OPTIONS') {
        context.res = {
            status: 204,
            headers: corsHeaders
        };
        return;
    }

    try {
        if (req.method !== 'POST') {
            context.res = {
                status: 405,
                headers: corsHeaders,
                body: { error: 'Method not allowed' }
            };
            return;
        }

        const { data, sessionId, action = 'track' } = req.body;
        
        if (!data || !sessionId) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { error: 'Missing required data' }
            };
            return;
        }

        // Simple validation token (optional)
        const token = req.headers['x-aps-token'];
        if (token !== process.env.APS_API_TOKEN && process.env.APS_API_TOKEN) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: { error: 'Unauthorized' }
            };
            return;
        }

        // Process different actions
        let result;
        switch (action) {
            case 'track':
                result = await processTrackingData(data, sessionId);
                break;
            case 'validate':
                result = await validateData(data);
                break;
            case 'health':
                result = { status: 'healthy', timestamp: new Date().toISOString() };
                break;
            default:
                result = { error: 'Unknown action' };
        }

        context.res = {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            body: result
        };

    } catch (error) {
        context.log.error('APS error:', error);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: { error: 'Processing failed' }
        };
    }
};

async function processTrackingData(data, sessionId) {
    // Simple data normalization
    const normalizedData = {
        sessionId,
        timestamp: new Date().toISOString(),
        ip: data.ip || 'unknown',
        userAgent: data.userAgent || 'unknown',
        source: data.source || 'unknown',
        
        // Parse and categorize
        events: data.events || [],
        metrics: data.metrics || {},
        
        // Anonymize sensitive info
        userHash: data.userId ? crypto.createHash('sha256').update(data.userId).digest('hex').substr(0, 16) : null
    };

    context.log.info('APS processed data:', {
        sessionId: normalizedData.sessionId,
        eventCount: normalizedData.events.length,
        timestamp: normalizedData.timestamp
    });

    return {
        success: true,
        processed: true,
        dataId: crypto.randomBytes(8).toString('hex'),
        timestamp: normalizedData.timestamp
    };
}

async function validateData(data) {
    const validationRules = {
        isValid: true,
        issues: []
    };

    // Check for required fields
    if (!data.sessionId) {
        validationRules.issues.push('Missing sessionId');
        validationRules.isValid = false;
    }

    if (data.events && !Array.isArray(data.events)) {
        validationRules.issues.push('Events must be an array');
        validationRules.isValid = false;
    }

    // Check data size
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 100000) {
        validationRules.issues.push(`Data too large: ${dataSize} bytes`);
        validationRules.isValid = false;
    }

    return validationRules;
}
