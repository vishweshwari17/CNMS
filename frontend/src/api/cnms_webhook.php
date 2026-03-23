<?php
/**
 * cnms_webhook.php
 * 
 * Add this file to your company LNMS (192.78.10.111).
 * Call send_to_cnms() whenever an alarm fires or resolves.
 * 
 * Usage in your LNMS alert scripts:
 *   require_once 'cnms_webhook.php';
 *   send_to_cnms('ALARM_NEW', [
 *       'alarm_uid'   => 'ALM-12345',
 *       'device_name' => 'RTR-CORE-01',
 *       'alarm_type'  => 'Link Down',
 *       'severity'    => 'Critical',
 *       'description' => 'Interface GigE0/0 is down',
 *   ]);
 */

define('CNMS_URL',    'http://<YOUR-CNMS-PUBLIC-IP>:8001/webhook/lnms');
define('CNMS_SECRET', 'your-secret-key');   // must match WEBHOOK_SECRET in CNMS .env
define('LNMS_NODE_ID', 'LNMS-COMPANY-01'); // how this node appears in CNMS

/**
 * Send a message to CNMS.
 *
 * @param string $msg_type  ALARM_NEW | ALARM_RESOLVED | DEVICE_UPDATE | HEARTBEAT
 * @param array  $data      Message payload
 * @return bool             True on success
 */
function send_to_cnms(string $msg_type, array $data = []): bool {
    $payload = array_merge($data, [
        'msg_type'     => $msg_type,
        'node_id'      => LNMS_NODE_ID,
        'timestamp'    => date('c'),
    ]);

    $ch = curl_init(CNMS_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-LNMS-Secret: ' . CNMS_SECRET,
        ],
    ]);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error     = curl_error($ch);
    curl_close($ch);

    if ($error || $http_code !== 200) {
        error_log("[CNMS Webhook] Failed: HTTP $http_code | $error | Response: $response");
        return false;
    }

    return true;
}

// ── Example: send alarm ──────────────────────────────────────
// send_to_cnms('ALARM_NEW', [
//     'alarm_uid'   => 'ALM-' . uniqid(),
//     'device_name' => 'RTR-CORE-01',
//     'alarm_type'  => 'Link Down',
//     'severity'    => 'Critical',       // Critical|Major|Minor|Warning|Info
//     'description' => 'GigE0/0 down',
//     'ip_address'  => '10.0.0.1',
// ]);

// ── Example: resolve alarm ───────────────────────────────────
// send_to_cnms('ALARM_RESOLVED', [
//     'alarm_uid' => 'ALM-12345',
// ]);

// ── Example: heartbeat (call every 60s via cron) ─────────────
// send_to_cnms('HEARTBEAT');

// ── Example: device sync ─────────────────────────────────────
// send_to_cnms('DEVICE_SYNC', [
//     'devices' => [
//         ['hostname'=>'RTR-01','ip_address'=>'10.0.0.1','device_type'=>'Router','status'=>'ACTIVE'],
//         ['hostname'=>'SW-01', 'ip_address'=>'10.0.0.2','device_type'=>'Switch','status'=>'ACTIVE'],
//     ]
// ]);