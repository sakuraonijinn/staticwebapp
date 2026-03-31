module.exports = async function (context, req) {
    context.log('Beacon endpoint pinged');
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
        context.res = {
            status: 204,
            headers: corsHeaders
        };
        return;
    }

    try {
        // Simple tracking beacon endpoint
        const beaconData = {
            timestamp: new Date().toISOString(),
            ip: req.headers['x-forwarded-for'] || req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            source: req.query.source || 'direct',
            referrer: req.headers.referer || 'unknown'
        };

        context.log.info('Beacon data:', beaconData);

        // Return minimal response
        context.res = {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            body: {
                status: 'active',
                timestamp: beaconData.timestamp,
                session: 'ok'
            }
        };

    } catch (error) {
        context.log.error('Beacon error:', error);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: { error: 'Beacon failed' }
        };
    }
};
