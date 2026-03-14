process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1';
import './config.js';
import './api.js';
import { createRequire } from 'module';
import path, { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { platform } from 'process';
import fs, { readdirSync, statSync, unlinkSync, existsSync, readFileSync, watch } from 'fs';
import yargs from 'yargs';
import { spawn } from 'child_process';
import lodash from 'lodash';
import chalk from 'chalk';
import syntaxerror from 'syntax-error';
import { format } from 'util';
import pino from 'pino';
import crypto from 'crypto';
import { Boom } from '@hapi/boom';
import { makeWASocket, protoType, serialize } from './src/libraries/simple.js';
import { initializeSubBots } from './src/libraries/subBotManager.js';
import { Low, JSONFile } from 'lowdb';
import store from './src/libraries/store.js';
import LidResolver from './src/libraries/LidResolver.js';

const {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser
} = await import('@whiskeysockets/baileys');

import NodeCache from 'node-cache';
const { chain } = lodash;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
let stopped = 'close';
protoType();
serialize();

const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
const userDevicesCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
    return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
    return path.dirname(global.__filename(pathURL, true));
};
global.__require = function require(dir = import.meta.url) {
    return createRequire(dir);
};

global.API = (name, path = '/', query = {}, apikeyqueryname) => (name in global.APIs ? global.APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({ ...query, ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}) })) : '');
global.timestamp = { start: new Date };
global.videoList = [];
global.videoListXXX = [];
const __dirname = global.__dirname(import.meta.url);
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[#!/.]');
global.db = new Low(/https?:\/\//.test(opts['db'] || '') ? new cloudDBAdapter(opts['db']) : new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`));

global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) {
        return new Promise((resolve) => setInterval(async function() {
            if (!global.db.READ) {
                clearInterval(this);
                resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
            }
        }, 1 * 1000));
    }
    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read().catch(console.error);
    global.db.READ = null;
    global.db.data = {
        users: {},
        chats: {},
        stats: {},
        msgs: {},
        sticker: {},
        settings: {},
        ...(global.db.data || {}),
    };
    global.db.chain = chain(global.db.data);
};
loadDatabase();

class LidDataManager {
    constructor(cacheFile = './src/lidsresolve.json') {
        this.cacheFile = cacheFile;
    }

    loadData() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = fs.readFileSync(this.cacheFile, 'utf8');
                return JSON.parse(data);
            }
            return {};
        } catch (error) {
            console.error('❌ Error cargando cache LID:', error.message);
            return {};
        }
    }

    getUserInfo(lidNumber) {
        const data = this.loadData();
        return data[lidNumber] || null;
    }

    getUserInfoByJid(jid) {
        const data = this.loadData();
        for (const [key, entry] of Object.entries(data)) {
            if (entry && entry.jid === jid) {
                return entry;
            }
        }
        return null;
    }

    findLidByJid(jid) {
        const data = this.loadData();
        for (const [key, entry] of Object.entries(data)) {
            if (entry && entry.jid === jid) {
                return entry.lid;
            }
        }
        return null;
    }

    getAllUsers() {
        const data = this.loadData();
        const users = [];
        for (const [key, entry] of Object.entries(data)) {
            if (entry && !entry.notFound && !entry.error) {
                users.push({
                    lid: entry.lid,
                    jid: entry.jid,
                    name: entry.name,
                    country: entry.country,
                    phoneNumber: entry.phoneNumber,
                    isPhoneDetected: entry.phoneDetected || entry.corrected,
                    timestamp: new Date(entry.timestamp).toLocaleString()
                });
            }
        }
        return users.sort((a, b) => a.name.localeCompare(b.name));
    }

    getStats() {
        const data = this.loadData();
        let valid = 0, notFound = 0, errors = 0, phoneNumbers = 0, corrected = 0;
        for (const [key, entry] of Object.entries(data)) {
            if (entry) {
                if (entry.phoneDetected || entry.corrected) phoneNumbers++;
                if (entry.corrected) corrected++;
                if (entry.notFound) notFound++;
                else if (entry.error) errors++;
                else valid++;
            }
        }
        return {
            total: Object.keys(data).length,
            valid,
            notFound,
            errors,
            phoneNumbers,
            corrected,
            cacheFile: this.cacheFile,
            fileExists: fs.existsSync(this.cacheFile)
        };
    }

    getUsersByCountry() {
        const data = this.loadData();
        const countries = {};
        for (const [key, entry] of Object.entries(data)) {
            if (entry && !entry.notFound && !entry.error && entry.country) {
                if (!countries[entry.country]) {
                    countries[entry.country] = [];
                }
                countries[entry.country].push({
                    lid: entry.lid,
                    jid: entry.jid,
                    name: entry.name,
                    phoneNumber: entry.phoneNumber
                });
            }
        }
        for (const country of Object.keys(countries)) {
            countries[country].sort((a, b) => a.name.localeCompare(b.name));
        }
        return countries;
    }
}

const lidDataManager = new LidDataManager();

async function processTextMentions(text, groupId, lidResolver) {
    if (!text || !groupId || !text.includes('@')) return text;
    try {
        const mentionRegex = /@(\d{8,20})/g;
        const mentions = [...text.matchAll(mentionRegex)];
        if (!mentions.length) return text;
        let processedText = text;
        const processedMentions = new Set();
        const replacements = new Map();
        for (const mention of mentions) {
            const [fullMatch, lidNumber] = mention;
            if (processedMentions.has(lidNumber)) continue;
            processedMentions.add(lidNumber);
            const lidJid = `${lidNumber}@lid`;
            try {
                const resolvedJid = await lidResolver.resolveLid(lidJid, groupId);
                if (resolvedJid && resolvedJid !== lidJid && !resolvedJid.endsWith('@lid')) {
                    const resolvedNumber = resolvedJid.split('@')[0];
                    if (resolvedNumber && resolvedNumber !== lidNumber) {
                        replacements.set(lidNumber, resolvedNumber);
                    }
                }
            } catch (error) {
                console.error(`❌ Error procesando mención LID ${lidNumber}:`, error.message);
            }
        }
        for (const [lidNumber, resolvedNumber] of replacements.entries()) {
            const globalRegex = new RegExp(`@${lidNumber}\\b`, 'g');
            processedText = processedText.replace(globalRegex, `@${resolvedNumber}`);
        }
        return processedText;
    } catch (error) {
        console.error('❌ Error en processTextMentions:', error);
        return text;
    }
}

async function processMessageContent(messageContent, groupChatId, lidResolver) {
    if (!messageContent || typeof messageContent !== 'object') return;
    const messageTypes = Object.keys(messageContent);
    for (const msgType of messageTypes) {
        const msgContent = messageContent[msgType];
        if (!msgContent || typeof msgContent !== 'object') continue;
        if (typeof msgContent.text === 'string') {
            try {
                const originalText = msgContent.text;
                msgContent.text = await processTextMentions(originalText, groupChatId, lidResolver);
            } catch (error) {
                console.error('❌ Error procesando texto:', error);
            }
        }
        if (typeof msgContent.caption === 'string') {
            try {
                const originalCaption = msgContent.caption;
                msgContent.caption = await processTextMentions(originalCaption, groupChatId, lidResolver);
            } catch (error) {
                console.error('❌ Error procesando caption:', error);
            }
        }
        if (msgContent.contextInfo) {
            await processContextInfo(msgContent.contextInfo, groupChatId, lidResolver);
        }
    }
}

async function processContextInfo(contextInfo, groupChatId, lidResolver) {
    if (!contextInfo || typeof contextInfo !== 'object') return;
    if (contextInfo.mentionedJid && Array.isArray(contextInfo.mentionedJid)) {
        const resolvedMentions = [];
        for (const jid of contextInfo.mentionedJid) {
            if (typeof jid === 'string' && jid.endsWith?.('@lid')) {
                try {
                    const resolved = await lidResolver.resolveLid(jid, groupChatId);
                    resolvedMentions.push(resolved && !resolved.endsWith('@lid') ? resolved : jid);
                } catch (error) {
                    resolvedMentions.push(jid);
                }
            } else {
                resolvedMentions.push(jid);
            }
        }
        contextInfo.mentionedJid = resolvedMentions;
    }
    if (typeof contextInfo.participant === 'string' && contextInfo.participant.endsWith?.('@lid')) {
        try {
            const resolved = await lidResolver.resolveLid(contextInfo.participant, groupChatId);
            if (resolved && !resolved.endsWith('@lid')) {
                contextInfo.participant = resolved;
            }
        } catch (error) {
            console.error('❌ Error resolviendo participant en contextInfo:', error);
        }
    }
    if (contextInfo.quotedMessage) {
        await processMessageContent(contextInfo.quotedMessage, groupChatId, lidResolver);
    }
    if (typeof contextInfo.stanzaId === 'string') {
        contextInfo.stanzaId = await processTextMentions(contextInfo.stanzaId, groupChatId, lidResolver);
    }
}

async function processMessageForDisplay(message, lidResolver) {
    if (!message || !lidResolver) return message;
    try {
        const processedMessage = JSON.parse(JSON.stringify(message));
        const groupChatId = message.key?.remoteJid?.endsWith?.('@g.us') ? message.key.remoteJid : null;
        if (!groupChatId) return processedMessage;
        if (processedMessage.key?.participant?.endsWith?.('@lid')) {
            try {
                const resolved = await lidResolver.resolveLid(processedMessage.key.participant, groupChatId);
                if (resolved && resolved !== processedMessage.key.participant && !resolved.endsWith('@lid')) {
                    processedMessage.key.participant = resolved;
                }
            } catch (error) {
                console.error('❌ Error resolviendo participant:', error);
            }
        }
        if (processedMessage.mentionedJid && Array.isArray(processedMessage.mentionedJid)) {
            const resolvedMentions = [];
            for (const jid of processedMessage.mentionedJid) {
                if (typeof jid === 'string' && jid.endsWith?.('@lid')) {
                    try {
                        const resolved = await lidResolver.resolveLid(jid, groupChatId);
                        resolvedMentions.push(resolved && !resolved.endsWith('@lid') ? resolved : jid);
                    } catch (error) {
                        resolvedMentions.push(jid);
                    }
                } else {
                    resolvedMentions.push(jid);
                }
            }
            processedMessage.mentionedJid = resolvedMentions;
        }
        if (processedMessage.message) {
            await processMessageContent(processedMessage.message, groupChatId, lidResolver);
        }
        return processedMessage;
    } catch (error) {
        console.error('❌ Error procesando mensaje para display:', error);
        return message;
    }
}

function extractAllText(message) {
    if (!message?.message) return '';
    let allText = '';
    const extractFromContent = (content) => {
        if (!content) return '';
        let text = '';
        if (content.text) text += content.text + ' ';
        if (content.caption) text += content.caption + ' ';
        if (content.contextInfo?.quotedMessage) {
            const quotedTypes = Object.keys(content.contextInfo.quotedMessage);
            for (const quotedType of quotedTypes) {
                const quotedContent = content.contextInfo.quotedMessage[quotedType];
                text += extractFromContent(quotedContent);
            }
        }
        return text;
    };
    const messageTypes = Object.keys(message.message);
    for (const msgType of messageTypes) {
        allText += extractFromContent(message.message[msgType]);
    }
    return allText.trim();
}

async function interceptMessages(messages, lidResolver) {
    if (!Array.isArray(messages)) return messages;
    const processedMessages = [];
    for (const message of messages) {
        try {
            let processedMessage = message;
            if (lidResolver && typeof lidResolver.processMessage === 'function') {
                try {
                    processedMessage = await lidResolver.processMessage(message);
                } catch (error) {
                    console.error('❌ Error en lidResolver.processMessage:', error);
                }
            }
            processedMessage = await processMessageForDisplay(processedMessage, lidResolver);
            processedMessages.push(processedMessage);
        } catch (error) {
            console.error('❌ Error interceptando mensaje:', error);
            processedMessages.push(message);
        }
    }
    return processedMessages;
}

const { state, saveCreds } = await useMultiFileAuthState(global.authFile);
const { version, isLatest } = await fetchLatestBaileysVersion();
console.log({ version, isLatest });

let phoneNumber = global.botnumber;
if (!phoneNumber) {
    console.error(chalk.bold.redBright('❌ ERROR: No phone number configured. Please set global.botnumber in config.js'));
    process.exit(1);
}

phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
if (!/^\d+$/.test(phoneNumber)) {
    console.error(chalk.bold.redBright('❌ ERROR: Invalid phone number format. Must contain only numbers.'));
    process.exit(1);
}

const filterStrings = [
    "Q2xvc2luZyBzdGFsZSBvcGVu",
    "Q2xvc2luZyBvcGVuIHNlc3Npb24=",
    "RmFpbGVkIHRvIGRlY3J5cHQ=",
    "U2Vzc2lvbiBlcnJvcg==",
    "RXJyb3I6IEJhZCBNQUM=",
    "RGVjcnlwdGVkIG1lc3NhZ2U="
];

console.info = () => { };
console.debug = () => { };
['log', 'warn', 'error'].forEach(methodName => {
    const originalMethod = console[methodName];
    console[methodName] = function() {
        const message = arguments[0];
        if (typeof message === 'string' && filterStrings.some(filterString => message.includes(Buffer.from(filterString, 'base64').toString()))) {
            arguments[0] = "";
        }
        originalMethod.apply(console, arguments);
    };
});

process.on('uncaughtException', (err) => {
    if (filterStrings.includes(Buffer.from(err.message).toString('base64'))) return;
    console.error('Uncaught Exception:', err);
});

const connectionOptions = {
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    mobile: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
    },
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    getMessage: async (key) => {
        try {
            let jid = jidNormalizedUser(key.remoteJid);
            let msg = await store.loadMessage(jid, key.id);
            return msg?.message || "";
        } catch (error) {
            return "";
        }
    },
    msgRetryCounterCache,
    userDevicesCache,
    defaultQueryTimeoutMs: undefined,
    cachedGroupMetadata: (jid) => global.conn.chats[jid] ?? {},
    keepAliveIntervalMs: 30000,
    maxIdleTimeMs: 60000,
    version,
};

global.conn = makeWASocket(connectionOptions);
const lidResolver = new LidResolver(global.conn);

let pairingCodeGenerated = false;
if (!global.conn.authState.creds.registered && !pairingCodeGenerated) {
    pairingCodeGenerated = true;
    setTimeout(async () => {
        try {
            let code = await global.conn.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(chalk.yellow('[ ℹ️ ] Use this pairing code in WhatsApp:'));
            console.log(chalk.black(chalk.bgGreen(`\n ${code} \n`)));
        } catch (error) {
            console.error(chalk.bold.redBright('❌ Error generating pairing code:'), error.message);
            process.exit(1);
        }
    }, 3000);
}

setTimeout(async () => {
    try {
        if (lidResolver) {
            lidResolver.autoCorrectPhoneNumbers();
        }
    } catch (error) {
        console.error('❌ Error en análisis inicial:', error.message);
    }
}, 5000);

conn.isInit = false;
conn.well = false;
conn.logger.info(`[　ℹ️　] Cargando...\n`);

if (!opts['test']) {
    if (global.db) {
        setInterval(async () => {
            if (global.db.data) await global.db.write();
        }, 30 * 1000);
    }
}

if (opts['server']) (await import('./server.js')).default(global.conn, PORT);

function clearTmp() {
    const tmp = [join(__dirname, './src/tmp')];
    const filename = [];
    tmp.forEach((dirname) => readdirSync(dirname).forEach((file) => filename.push(join(dirname, file))));
    return filename.map((file) => {
        const stats = statSync(file);
        if (stats.isFile() && (Date.now() - stats.mtimeMs >= 1000 * 60 * 3)) return unlinkSync(file);
        return false;
    });
}

const dirToWatchccc = path.join(__dirname, './');
function deleteCoreFiles(filePath) {
    const coreFilePattern = /^core\.\d+$/i;
    const filename = path.basename(filePath);
    if (coreFilePattern.test(filename)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error eliminando el archivo ${filePath}:`, err);
        });
    }
}
fs.watch(dirToWatchccc, (eventType, filename) => {
    if (eventType === 'rename') {
        const filePath = path.join(dirToWatchccc, filename);
        fs.stat(filePath, (err, stats) => {
            if (!err && stats.isFile()) deleteCoreFiles(filePath);
        });
    }
});

function purgeSession() {
    let prekey = [];
    let directorio = readdirSync("./SazikiSession");
    let filesFolderPreKeys = directorio.filter(file => file.startsWith('pre-key-'));
    prekey = [...prekey, ...filesFolderPreKeys];
    filesFolderPreKeys.forEach(files => unlinkSync(`./SazikiSession/${files}`));
}

function purgeSessionSB() {
    try {
        let listaDirectorios = readdirSync('./jadibts/');
        let SBprekey = [];
        listaDirectorios.forEach(directorio => {
            if (statSync(`./jadibts/${directorio}`).isDirectory()) {
                let DSBPreKeys = readdirSync(`./jadibts/${directorio}`).filter(fileInDir => fileInDir.startsWith('pre-key-'));
                SBprekey = [...SBprekey, ...DSBPreKeys];
                DSBPreKeys.forEach(fileInDir => unlinkSync(`./jadibts/${directorio}/${fileInDir}`));
            }
        });
    } catch (err) {
        console.log(chalk.bold.red(`[ ℹ️ ] Algo salio mal durante la eliminación, archivos no eliminados`));
    }
}

function purgeOldFiles() {
    const directories = ['./SazikiSession/', './jadibts/'];
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    directories.forEach(dir => {
        readdirSync(dir, (err, files) => {
            if (err) throw err;
            files.forEach(file => {
                const filePath = path.join(dir, file);
                stat(filePath, (err, stats) => {
                    if (err) throw err;
                    if (stats.isFile() && stats.mtimeMs < oneHourAgo && file !== 'creds.json') {
                        unlinkSync(filePath, err => {
                            if (err) throw err;
                        });
                    }
                });
            });
        });
    });
}

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 10000;

async function connectionUpdate(update) {
    const { connection, lastDisconnect, isNewLogin } = update;
    stopped = connection;
    if (isNewLogin) conn.isInit = true;
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const boomError = lastDisconnect?.error;
    if (statusCode && statusCode !== DisconnectReason.loggedOut && conn?.ws?.socket == null) {
        await global.reloadHandler(true).catch(console.error);
        global.timestamp.connect = new Date;
    }
    if (global.db.data == null) loadDatabase();
    if (connection == 'open') {
        console.log(chalk.yellow('[　ℹ️　　] Conectado correctamente.'));
        reconnectAttempts = 0;
        if (!global.subBotsInitialized) {
            global.subBotsInitialized = true;
            try {
                await initializeSubBots();
            } catch (error) {
                console.error(chalk.red('[ ⚠️ ] Error al inicializar sub-bots:'), error);
            }
        }
    }
    let reason = new Boom(boomError)?.output?.statusCode;
    if (connection === 'close') {
        if (reason === DisconnectReason.badSession) {
            console.log(chalk.bold.redBright(`[ ⚠️ ] Sesión incorrecta, elimina la carpeta ${global.authFile} y escanea nuevamente.`));
            reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        } else if (reason === DisconnectReason.connectionClosed) {
            console.log(chalk.yellow(`[ ⚠️ ] Conexión cerrada, reintentando en ${RECONNECT_DELAY/1000}s...`));
        } else if (reason === DisconnectReason.connectionLost) {
            console.log(chalk.yellow(`[ ⚠️ ] Conexión perdida, reintentando en ${RECONNECT_DELAY/1000}s...`));
        } else if (reason === DisconnectReason.connectionReplaced) {
            console.log(chalk.bold.redBright('[ ⚠️ ] Conexión reemplazada por otra sesión. Deteniendo reintentos.'));
            reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
            return;
        } else if (reason === DisconnectReason.loggedOut) {
            console.log(chalk.bold.redBright(`[ ⚠️ ] Sesión cerrada, elimina la carpeta ${global.authFile} y escanea nuevamente.`));
            reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        } else if (reason === DisconnectReason.restartRequired) {
            console.log(chalk.yellow('[ ⚠️ ] Reinicio necesario, reconectando...'));
        } else if (reason === DisconnectReason.timedOut) {
            console.log(chalk.yellow(`[ ⚠️ ] Tiempo de conexión agotado, reintentando en ${RECONNECT_DELAY/1000}s...`));
        } else {
            console.log(chalk.yellow(`[ ⚠️ ] Razón de desconexión desconocida (${reason}), reintentando...`));
        }

        if (reason !== DisconnectReason.loggedOut && reason !== DisconnectReason.connectionReplaced && reason !== DisconnectReason.badSession) {
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(chalk.yellow(`[ ℹ️ ] Intento de reconexión ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`));
                setTimeout(() => global.reloadHandler(true), RECONNECT_DELAY);
            } else {
                console.log(chalk.bold.redBright('[ ❌ ] Máximos intentos de reconexión alcanzados. Deteniendo.'));
            }
        }
    }
}

process.on('uncaughtException', console.error);

let isInit = true;
let handler = await import('./handler.js');

global.reloadHandler = async function(restatConn) {
    try {
        const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (Object.keys(Handler || {}).length) handler = Handler;
    } catch (e) {
        console.error(e);
    }
    if (restatConn) {
        const oldChats = global.conn.chats;
        try {
            global.conn.ws.close();
        } catch { }
        conn.ev.removeAllListeners();
        global.conn = makeWASocket(connectionOptions, { chats: oldChats });
        store?.bind(conn);
        lidResolver.conn = global.conn;
        isInit = true;
    }
    if (!isInit) {
        conn.ev.off('messages.upsert', conn.handler);
        conn.ev.off('group-participants.update', conn.participantsUpdate);
        conn.ev.off('groups.update', conn.groupsUpdate);
        conn.ev.off('message.delete', conn.onDelete);
        conn.ev.off('call', conn.onCall);
        conn.ev.off('connection.update', conn.connectionUpdate);
        conn.ev.off('creds.update', conn.credsUpdate);
    }

    conn.welcome = '👋 ¡Bienvenido/a!\n@user';
    conn.bye = '👋 ¡Hasta luego!\n@user';
    conn.spromote = '*[ ℹ️ ] @user Fue promovido a administrador.*';
    conn.sdemote = '*[ ℹ️ ] @user Fue degradado de administrador.*';
    conn.sDesc = '*[ ℹ️ ] La descripción del grupo ha sido modificada.*';
    conn.sSubject = '*[ ℹ️ ] El nombre del grupo ha sido modificado.*';
    conn.sIcon = '*[ ℹ️ ] Se ha cambiado la foto de perfil del grupo.*';
    conn.sRevoke = '*[ ℹ️ ] El enlace de invitación al grupo ha sido restablecido.*';

    const originalHandler = handler.handler.bind(global.conn);
    conn.handler = async function(chatUpdate) {
        try {
            if (chatUpdate.messages) {
                chatUpdate.messages = await interceptMessages(chatUpdate.messages, lidResolver);
                for (let i = 0; i < chatUpdate.messages.length; i++) {
                    const message = chatUpdate.messages[i];
                    if (message?.key?.remoteJid?.endsWith('@g.us')) {
                        try {
                            const fullyProcessedMessage = await processMessageForDisplay(message, lidResolver);
                            chatUpdate.messages[i] = fullyProcessedMessage;
                            const messageText = extractAllText(fullyProcessedMessage);
                        } catch (error) {
                            console.error('❌ Error en procesamiento final de mensaje:', error);
                        }
                    }
                }
            }
            return await originalHandler(chatUpdate);
        } catch (error) {
            console.error('❌ Error en handler interceptor:', error);
            return await originalHandler(chatUpdate);
        }
    };

    conn.participantsUpdate = handler.participantsUpdate.bind(global.conn);
    conn.groupsUpdate = handler.groupsUpdate.bind(global.conn);
    conn.onDelete = handler.deleteUpdate.bind(global.conn);
    conn.onCall = handler.callUpdate.bind(global.conn);
    conn.connectionUpdate = connectionUpdate.bind(global.conn);
    conn.credsUpdate = saveCreds.bind(global.conn, true);

    const currentDateTime = new Date();
    const messageDateTime = new Date(conn.ev);
    if (currentDateTime >= messageDateTime) {
        const chats = Object.entries(conn.chats).filter(([jid, chat]) => !jid.endsWith('@g.us') && chat.isChats).map((v) => v[0]);
    } else {
        const chats = Object.entries(conn.chats).filter(([jid, chat]) => !jid.endsWith('@g.us') && chat.isChats).map((v) => v[0]);
    }

    conn.ev.on('messages.upsert', async (chatUpdate) => {
  if (!chatUpdate.messages) return;
  console.log("📩 MESSAGE EVENT:", chatUpdate.type);
  await conn.handler(chatUpdate);
});
    conn.ev.on('group-participants.update', conn.participantsUpdate);
    conn.ev.on('groups.update', conn.groupsUpdate);
    conn.ev.on('message.delete', conn.onDelete);
    conn.ev.on('call', conn.onCall);
    conn.ev.on('connection.update', conn.connectionUpdate);
    conn.ev.on('creds.update', conn.credsUpdate);
    isInit = false;
    return true;
};

conn.lid = {
    getUserInfo: (lidNumber) => lidDataManager.getUserInfo(lidNumber),
    getUserInfoByJid: (jid) => lidDataManager.getUserInfoByJid(jid),
    findLidByJid: (jid) => lidDataManager.findLidByJid(jid),
    getAllUsers: () => lidDataManager.getAllUsers(),
    getStats: () => lidDataManager.getStats(),
    getUsersByCountry: () => lidDataManager.getUsersByCountry(),
    validatePhoneNumber: (phoneNumber) => {
        if (!lidResolver.phoneValidator) return false;
        return lidResolver.phoneValidator.isValidPhoneNumber(phoneNumber);
    },
    detectPhoneInLid: (lidString) => {
        if (!lidResolver.phoneValidator) return { isPhone: false };
        return lidResolver.phoneValidator.detectPhoneInLid(lidString);
    },
    forceSave: () => {
        try {
            lidResolver.forceSave();
            return true;
        } catch (error) {
            console.error('Error guardando caché LID:', error);
            return false;
        }
    },
    getCacheInfo: () => {
        try {
            const stats = lidDataManager.getStats();
            const analysis = lidResolver.analyzePhoneNumbers();
            return `📱 *ESTADÍSTICAS DEL CACHÉ LID*

📊 *General:*
• Total de entradas: ${stats.total}
• Entradas válidas: ${stats.valid}
• No encontradas: ${stats.notFound}
• Con errores: ${stats.errors}

📞 *Números telefónicos:*
• Detectados: ${stats.phoneNumbers}
• Corregidos: ${stats.corrected}
• Problemáticos: ${analysis.stats.phoneNumbersProblematic}

🗂️ *Caché:*
• Archivo: ${stats.cacheFile}
• Existe: ${stats.fileExists ? 'Sí' : 'No'}

🌍 *Países detectados:*
${Object.entries(lidDataManager.getUsersByCountry())
                .slice(0, 5)
                .map(([country, users]) => `• ${country}: ${users.length} usuarios`)
                .join('\n')}`;
        } catch (error) {
            return `❌ Error obteniendo información: ${error.message}`;
        }
    },
    forcePhoneCorrection: () => {
        try {
            const result = lidResolver.autoCorrectPhoneNumbers();
            if (result.corrected > 0) {
                return `✅ Se corrigieron ${result.corrected} números telefónicos automáticamente.`;
            } else {
                return '✅ No se encontraron números telefónicos que requieran corrección.';
            }
        } catch (error) {
            return `❌ Error en corrección automática: ${error.message}`;
        }
    },
    resolveLid: async (lidJid, groupChatId) => {
        try {
            return await lidResolver.resolveLid(lidJid, groupChatId);
        } catch (error) {
            console.error('Error resolviendo LID:', error);
            return lidJid;
        }
    },
    processTextMentions: async (text, groupId) => {
        try {
            return await processTextMentions(text, groupId, lidResolver);
        } catch (error) {
            console.error('Error procesando menciones en texto:', error);
            return text;
        }
    }
};

const pluginFolder = global.__dirname(join(__dirname, './plugins/index'));
const pluginFilter = (filename) => /\.js$/.test(filename);
global.plugins = {};

async function filesInit() {
    for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            const file = global.__filename(join(pluginFolder, filename));
            const module = await import(file);
            global.plugins[filename] = module.default || module;
        } catch (e) {
            conn.logger.error(e);
            delete global.plugins[filename];
        }
    }
}
filesInit().then((_) => Object.keys(global.plugins)).catch(console.error);

global.reload = async (_ev, filename) => {
    if (pluginFilter(filename)) {
        const dir = global.__filename(join(pluginFolder, filename), true);
        if (filename in global.plugins) {
            if (existsSync(dir)) conn.logger.info(` updated plugin - '${filename}'`);
            else {
                conn.logger.warn(`deleted plugin - '${filename}'`);
                return delete global.plugins[filename];
            }
        } else conn.logger.info(`new plugin - '${filename}'`);
        const err = syntaxerror(readFileSync(dir), filename, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true,
        });
        if (err) conn.logger.error(`syntax error while loading '${filename}'\n${format(err)}`);
        else {
            try {
                const module = (await import(`${global.__filename(dir)}?update=${Date.now()}`));
                global.plugins[filename] = module.default || module;
            } catch (e) {
                conn.logger.error(`error require plugin '${filename}\n${format(e)}'`);
            } finally {
                global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
            }
        }
    }
};
Object.freeze(global.reload);
watch(pluginFolder, global.reload);
await global.reloadHandler();

setInterval(async () => {
    if (stopped === 'close' || !conn || !conn?.user) return;
    await clearTmp();
}, 180000);

setInterval(async () => {
    if (stopped === 'close' || !conn || !conn?.user) return;
    const _uptime = process.uptime() * 1000;
    const uptime = clockString(_uptime);
    const bio = `• Activo: ${uptime} | TheMystic-Bot-MD`;
    await conn?.updateProfileStatus(bio).catch((_) => _);
}, 60000);

setInterval(async () => {
    if (stopped === 'close' || !conn || !conn?.user || !lidResolver) return;
    try {
        const stats = lidDataManager.getStats();
        if (stats.total > 800) {
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            let cleanedCount = 0;
            for (const [key, entry] of lidResolver.cache.entries()) {
                if (entry.timestamp < sevenDaysAgo && (entry.notFound || entry.error)) {
                    lidResolver.cache.delete(key);
                    if (entry.jid && lidResolver.jidToLidMap.has(entry.jid)) {
                        lidResolver.jidToLidMap.delete(entry.jid);
                    }
                    cleanedCount++;
                }
            }
            if (cleanedCount > 0) {
                lidResolver.markDirty();
            }
        }
        if (Math.random() < 0.1) {
            const correctionResult = lidResolver.autoCorrectPhoneNumbers();
        }
    } catch (error) {
        console.error('❌ Error en limpieza de caché LID:', error.message);
    }
}, 30 * 60 * 1000);

function clockString(ms) {
    const d = isNaN(ms) ? '--' : Math.floor(ms / 86400000);
    const h = isNaN(ms) ? '--' : Math.floor(ms / 3600000) % 24;
    const m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60;
    const s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60;
    return [d, 'd ', h, 'h ', m, 'm ', s, 's '].map((v) => v.toString().padStart(2, 0)).join('');
}

const gracefulShutdown = () => {
    if (lidResolver?.isDirty) {
        try {
            lidResolver.forceSave();
        } catch (error) {
            console.error('❌ Error guardando caché LID:', error.message);
        }
    }
};

process.on('exit', gracefulShutdown);
process.on('SIGINT', () => {
    gracefulShutdown();
    process.exit(0);
});
process.on('SIGTERM', () => {
    gracefulShutdown();
    process.exit(0);
});
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message && reason.message.includes('lid')) {
        console.error('❌ Error no manejado relacionado con LID:', reason);
    }
});

async function _quickTest() {
    const test = await Promise.all([
        spawn('ffmpeg'),
        spawn('ffprobe'),
        spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
        spawn('convert'),
        spawn('magick'),
        spawn('gm'),
        spawn('find', ['--version']),
    ].map((p) => {
        return Promise.race([
            new Promise((resolve) => {
                p.on('close', (code) => {
                    resolve(code !== 127);
                });
            }),
            new Promise((resolve) => {
                p.on('error', (_) => resolve(false));
            })]);
    }));
    const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
    global.support = { ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find };
    Object.freeze(global.support);
}
