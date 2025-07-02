const bedrock = require('bedrock-protocol');
const express = require('express');

const config = require('./settings.json');
const loggers = require('./logging.js');
const logger = loggers.logger;

const app = express();

app.get('/', (req, res) => {
  const currentUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  res.send('🎮 Your Bedrock Bot Is Ready! Subscribe: <a href="https://youtube.com/@H2N_OFFICIAL">H2N OFFICIAL</a><br>📊 Uptime Link: <a href="' + currentUrl + '">' + currentUrl + '</a><br>🎯 Server: ' + config.server.ip + ':' + config.server.port + '<br>📱 Version: Bedrock ' + config.server.version);
}); 

app.listen(3000, () => {
    logger.info('Web server started on port 3000');
});

let reconnectTimeout;
let isConnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

function createBedrockBot() {
    if (isConnecting) {
        logger.info('Already trying to connect, skipping...');
        return;
    }
    
    isConnecting = true;
    reconnectAttempts++;
    
    if (reconnectAttempts > maxReconnectAttempts) {
        logger.error(`❌ Maximum reconnect attempts (${maxReconnectAttempts}) reached. Please check server status.`);
        isConnecting = false;
        return;
    }
    
    logger.info(`🔄 Starting Bedrock Bot (Attempt ${reconnectAttempts}/${maxReconnectAttempts}) for ${config.server.ip}:${config.server.port}`);
    
    const client = bedrock.createClient({
        host: config.server.ip,
        port: config.server.port,
        username: config['bot-account'].username,
        offline: config['bot-account'].type === 'offline',
        version: config.server.version || '1.21.90',
        connectTimeout: 45000,  // زيادة timeout إلى 45 ثانية
        pingInterval: 15000,    // ping كل 15 ثانية
        keepAlive: true         // إبقاء الاتصال نشط
    });

    let isSpawned = false;
    let playerPosition = { x: 0, y: 64, z: 0 };
    let playerRotation = { yaw: 0, pitch: 0 };

    // معلومات البوت
    client.on('start_game', (packet) => {
        logger.info("🎮 Bedrock Bot connected successfully!");
        logger.info(`📍 Server: ${config.server.ip}:${config.server.port}`);
        logger.info(`👤 Username: ${config['bot-account'].username}`);
        logger.info(`🌍 World: ${packet.level_id || 'Unknown'}`);
        
        playerPosition = {
            x: packet.spawn_x || 0,
            y: packet.spawn_y || 64, 
            z: packet.spawn_z || 0
        };
        
        isSpawned = true;
        isConnecting = false;
        reconnectAttempts = 0; // إعادة تعيين المحاولات عند نجاح الاتصال

        // تشغيل الميزات بعد الدخول بتأخير قصير
        setTimeout(() => {
            startBotFeatures();
        }, 2000);
    });

    // تحديث موقع اللاعب
    client.on('move_actor_absolute', (packet) => {
        if (packet.runtime_entity_id === client.entityId) {
            playerPosition = packet.position;
            playerRotation = packet.rotation;
        }
    });

    // رسائل الدردشة
    client.on('text', (packet) => {
        if (config.utils['chat-log'] && packet.type === 'chat') {
            const username = packet.source_name || 'Server';
            const message = packet.message || '';
            logger.info(`💬 <${username}> ${message}`);
        }
    });

    // فصل الاتصال
    client.on('disconnect', (packet) => {
        isSpawned = false;
        isConnecting = false;
        const reason = packet.message || packet.hide_disconnect_screen || 'Unknown reason';
        logger.warn(`❌ Bot disconnected: ${reason}`);
        
        if (config.utils['auto-reconnect'] && reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(config.utils['auto-reconnect-delay'] || 8000, 15000); // حد أقصى 15 ثانية
            logger.info(`🔄 Reconnecting in ${delay/1000} seconds... (Attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
            
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
                createBedrockBot();
            }, delay);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
            logger.error(`❌ Maximum reconnection attempts reached. Bot stopped.`);
        }
    });

    // الأخطاء
    client.on('error', (err) => {
        isConnecting = false;
        logger.error(`🚨 Bedrock Bot Error: ${err.message}`);
        
        if (config.utils['auto-reconnect'] && reconnectAttempts < maxReconnectAttempts) {
            // زيادة تدريجية في وقت إعادة المحاولة
            const baseDelay = config.utils['auto-reconnect-delay'] || 8000;
            const delay = Math.min(baseDelay * reconnectAttempts, 30000); // حد أقصى 30 ثانية
            logger.info(`🔄 Reconnecting after error in ${delay/1000} seconds... (Attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
            
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
                createBedrockBot();
            }, delay);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
            logger.error(`❌ Maximum reconnection attempts reached after error. Bot stopped.`);
        }
    });

    function startBotFeatures() {
        // Anti-AFK Features
        if (config.utils['anti-afk'].enabled) {
            logger.info('⚡ Started Anti-AFK module for Bedrock');
            
            // حركة دورانية لمنع AFK
            if (config.utils['anti-afk'].rotate) {
                setInterval(() => {
                    if (!isSpawned) return;
                    
                    playerRotation.yaw += 5;
                    if (playerRotation.yaw >= 360) playerRotation.yaw = 0;
                    
                    try {
                        client.write('move_player', {
                            runtime_entity_id: client.entityId,
                            position: playerPosition,
                            rotation: playerRotation,
                            mode: 0,
                            on_ground: true,
                            ridden_runtime_entity_id: 0,
                            teleport_cause: 0,
                            teleport_source_type: 0
                        });
                    } catch(e) {
                        // تجاهل الأخطاء البسيطة
                    }
                }, 3000);
            }

            // الانحناء (sneak)
            if (config.utils['anti-afk'].sneak) {
                setInterval(() => {
                    if (!isSpawned) return;
                    
                    try {
                        client.write('player_action', {
                            runtime_entity_id: client.entityId,
                            action: 'start_sneak',
                            coordinates: playerPosition,
                            face: 0
                        });
                        
                        setTimeout(() => {
                            if (!isSpawned) return;
                            client.write('player_action', {
                                runtime_entity_id: client.entityId,
                                action: 'stop_sneak',
                                coordinates: playerPosition,
                                face: 0
                            });
                        }, 1000);
                    } catch(e) {
                        // تجاهل الأخطاء
                    }
                }, 6000);
            }

            // القفز
            if (config.utils['anti-afk'].jump) {
                setInterval(() => {
                    if (!isSpawned) return;
                    
                    try {
                        client.write('player_action', {
                            runtime_entity_id: client.entityId,
                            action: 'jump',
                            coordinates: playerPosition,
                            face: 0
                        });
                    } catch(e) {
                        // تجاهل الأخطاء
                    }
                }, 4000);
            }
        }

        // رسائل الدردشة التلقائية
        if (config.utils['chat-messages'].enabled) {
            logger.info('💬 Started chat messages module for Bedrock');
            
            let messages = config.utils['chat-messages']['messages'];
            let i = 0;
            
            if (config.utils['chat-messages'].repeat && messages && messages.length > 0) {
                let delay = config.utils['chat-messages']['repeat-delay'] * 1000;
                
                setInterval(() => {
                    if (!isSpawned || !messages[i] || typeof messages[i] !== 'string') return;
                    
                    try {
                        // التأكد من صحة الرسالة قبل الإرسال
                        const messageText = String(messages[i]).trim();
                        if (!messageText || messageText.length === 0) {
                            logger.warn(`⚠️ Empty message at index ${i}, skipping...`);
                            i = (i + 1) % messages.length;
                            return;
                        }

                        client.write('text', {
                            type: 'chat',
                            needs_translation: false,
                            source_name: String(config['bot-account'].username || 'Bot'),
                            message: messageText,
                            parameters: [],
                            xuid: '',
                            platform_chat_id: ''
                        });
                        
                        logger.info(`📤 Sent message: ${messageText}`);
                        
                        // الانتقال للرسالة التالية
                        i = (i + 1) % messages.length;
                        
                    } catch(e) {
                        logger.error(`❌ Failed to send chat message: ${e.message}`);
                        // الانتقال للرسالة التالية حتى لو فشلت الحالية
                        i = (i + 1) % messages.length;
                    }
                }, delay);
            } else {
                logger.warn('⚠️ Chat messages disabled: no valid messages found');
            }
        }

        // الانتقال للموقع المحدد
        if (config.position.enabled) {
            logger.info(`🎯 Moving to target position (${config.position.x}, ${config.position.y}, ${config.position.z})`);
            
            setTimeout(() => {
                if (!isSpawned) return;
                
                try {
                    const targetPos = {
                        x: config.position.x,
                        y: config.position.y,
                        z: config.position.z
                    };
                    
                    client.write('move_player', {
                        runtime_entity_id: client.entityId,
                        position: targetPos,
                        rotation: playerRotation,
                        mode: 2, // teleport mode
                        on_ground: true,
                        ridden_runtime_entity_id: 0,
                        teleport_cause: 0,
                        teleport_source_type: 0
                    });
                    
                    playerPosition = targetPos;
                    logger.info('✅ Moved to target position');
                } catch(e) {
                    logger.error(`Failed to move to position: ${e.message}`);
                }
            }, 2000);
        }
    }

    return client;
}

// تشغيل البوت
logger.info('🚀 Starting Bedrock Bot...');
createBedrockBot(); 