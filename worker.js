const WebSocket = require('ws');
const https = require('https');
const crypto = require('crypto');

// -----------------------------------------------------------------------------
// 1. CONFIGURATION & ARGUMENT PARSING
// -----------------------------------------------------------------------------
// Arguments passed from C# Launcher:
// Node(0) -> Script(1) -> MeetingID(2) -> StreamID(3) -> SignalingURL(4) -> ClientID(5) -> ClientSecret(6) -> ODC_ApiKey(7) -> CallbackURL(8)

const args = process.argv.slice(2);

if (args.length < 7) {
    console.error("❌ Error: Missing arguments. Expected 7 arguments.");
    process.exit(1);
}

const config = {
    meetingId: args[0],
    streamId: args[1],
    signalingUrl: args[2],
    clientId: args[3],
    clientSecret: args[4],
    odcApiKey: args[5],
    callbackUrl: args[6]
};

console.log(`[Worker] 🚀 Starting for Meeting: ${config.meetingId}`);

// -----------------------------------------------------------------------------
// 2. HELPER: GENERATE JWT SIGNATURE (Native Node.js)
// -----------------------------------------------------------------------------
function generateSignature(clientId, clientSecret, meetingId) {
    const timestamp = Math.floor(Date.now() / 1000) - 30; // 30s buffer
    const exp = timestamp + 60 * 60 * 2; // Valid for 2 hours

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        app_key: clientId,
        version: 1,
        user_identity: "ZoomODC_Listener",
        iat: timestamp,
        exp: exp,
        tpc: meetingId // "tpc" (Topic) is the Meeting ID
    };

    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    const signature = crypto.createHmac('sha256', clientSecret)
        .update(`${b64Header}.${b64Payload}`)
        .digest('base64url');

    return `${b64Header}.${b64Payload}.${signature}`;
}

// -----------------------------------------------------------------------------
// 3. MAIN: CONNECT TO ZOOM
// -----------------------------------------------------------------------------
const ws = new WebSocket(config.signalingUrl);

ws.on('open', () => {
    console.log('[WS] Connected to Zoom. Sending Handshake...');

    const signature = generateSignature(config.clientId, config.clientSecret, config.meetingId);

    // MESSAGE TYPE 1: Handshake Request
    const handshakeMsg = {
        type: 1,
        payload: {
            app_key: config.clientId,
            signature: signature,
            device_id: `aws_worker_${config.meetingId}`,
            device_name: "ODC_Integration_Node",
            user_identity: "ZoomODC_Listener"
        }
    };
    ws.send(JSON.stringify(handshakeMsg));
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data);

        // TYPE 2: Handshake Response (Success)
        if (msg.type === 2) {
            console.log('[WS] ✅ Handshake Accepted! Listening for audio/transcripts...');
            return;
        }

        // TYPE 12: Keep-Alive Request -> Reply with TYPE 13 (Pong)
        if (msg.type === 12) {
            // console.log('[WS] Ping received. Sending Pong.'); // Uncomment for verbose logs
            ws.send(JSON.stringify({ type: 13, payload: { timestamp: Date.now() } }));
            return;
        }

        // TYPE 17: Transcript Data
        if (msg.type === 17) { 
            const content = msg.payload?.object;
            const transcriptText = content?.content; 
            const speaker = content?.participant_name || "Unknown";
            
            if (transcriptText) {
                console.log(`[Transcript] ${speaker}: ${transcriptText}`);
                sendToODC(speaker, transcriptText);
            }
        }
    } catch (err) {
        console.error('[Error] Parsing message:', err);
    }
});

ws.on('close', () => {
    console.log('[WS] 🛑 Connection Closed. Shutting down server...');
    // This exit code allows the bash script to proceed to "shutdown -h now"
    process.exit(0); 
});

ws.on('error', (err) => {
    console.error('[WS] ⚠️ Error:', err);
    process.exit(1); 
});

// -----------------------------------------------------------------------------
// 4. HELPER: SEND DATA TO OUTSYSTEMS ODC
// -----------------------------------------------------------------------------
function sendToODC(speaker, text) {
    const postData = JSON.stringify({
        meeting_uuid: config.meetingId,
        speaker_name: speaker,
        transcript_text: text,
        timestamp: new Date().toISOString(),
        is_final: true,
        api_key: config.odcApiKey
    });

    const url = new URL(config.callbackUrl);

    const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
            console.error(`[ODC] ⚠️ Failed to send: Status ${res.statusCode}`);
        }
    });

    req.on('error', (e) => console.error(`[ODC] ❌ Request error: ${e.message}`));
    req.write(postData);
    req.end();
}