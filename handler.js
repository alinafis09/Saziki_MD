import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
import { smsg } from './src/libraries/simple.js';
import { format } from 'util';
import { fileURLToPath } from 'url';
import path, { join } from 'path';
import { unwatchFile, watchFile } from 'fs';
import fs from 'fs';
import chalk from 'chalk';
import ws from 'ws';
import settings, { 
  owner as ownerConfig, 
  bot as botConfig,
  getErrorMessage,
  getSuccessMessage,
  getMainOwner,
  getCurrentDate,
  getCurrentTime,
  formatUptime
} from './lib/settings.js';
import { consumeSaki, getCurrentSaki } from './src/libraries/saki.js';

// ✅ التعديل المهم هنا - استيراد proto بشكل صحيح
import baileys from '@whiskeysockets/baileys';
const { proto } = baileys;

// ==================== GLOBAL CONFIGURATION ====================
global.devCommands = global.devCommands || [];

// ==================== NEWSLETTER CONFIGURATION ====================
const NEWSLETTER_JID = '120363403118420523@newsletter';
const BOT_NAME = '¿𝑆𝑎𝑧𝑖𝑘𝑖 𝑐ℎ𝑎𝑛𝑛𝑒𝑙 | قنات سازيكي 彡';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Va8Q5VGLkPHqYxqVON3f';
const CHANNEL_THUMBNAIL = 'https://telegra.ph/file/1ecdb5a0aee62ef17d7fc.jpg';

// ==================== UTILITY FUNCTIONS ====================
const isNumber = (x) => typeof x === 'number' && !isNaN(x);
const delay = (ms) => isNumber(ms) && new Promise((resolve) => setTimeout(resolve, ms));

global.owner = ownerConfig.numbers.map(num => [num, ownerConfig.names[ownerConfig.numbers.indexOf(num)], true]);

// ==================== NEWSLETTER FORMATTING ====================
function formatAsNewsletter(content, sender) {
  if (!content) return content;
  if (typeof content === 'string') content = { text: content };
  if (typeof content !== 'object') return content;
  if (!content.contextInfo) content.contextInfo = {};
  
  const existingExternalAdReply = content.contextInfo.externalAdReply;
  
  content.contextInfo.forwardingScore = 999;
  content.contextInfo.isForwarded = true;
  content.contextInfo.forwardedNewsletterMessageInfo = {
    newsletterJid: NEWSLETTER_JID,
    newsletterName: BOT_NAME,
    serverMessageId: 100
  };
  
  content.contextInfo.externalAdReply = {
    title: existingExternalAdReply?.title || BOT_NAME,
    body: existingExternalAdReply?.body || '📢 𝐒𝐀𝐙𝐈𝐊𝐈 𝐁𝐎𝐓 𝐁𝐘 𝐀𝐋𝐈 𝐍𝐀𝐅𝐈𝐒 ⵥ',
    thumbnailUrl: existingExternalAdReply?.thumbnailUrl || CHANNEL_THUMBNAIL,
    sourceUrl: existingExternalAdReply?.sourceUrl || CHANNEL_LINK,
    mediaType: 1,
    renderLargerThumbnail: false
  };
  
  if (sender) {
    if (!content.contextInfo.mentionedJid) content.contextInfo.mentionedJid = [];
    if (!content.contextInfo.mentionedJid.includes(sender)) {
      content.contextInfo.mentionedJid.push(sender);
    }
  }
  
  return content;
}

function enhanceSendMessage(conn) {
  const originalSendMessage = conn.sendMessage;
  conn.sendMessage = async function(jid, content, options = {}) {
    try {
      const senderJid = options?.participant || jid;
      const formattedContent = formatAsNewsletter(content, senderJid);
      return originalSendMessage.call(this, jid, formattedContent, options);
    } catch (error) {
      console.error('❌ Error in enhanced sendMessage:', error);
      return originalSendMessage.call(this, jid, content, options);
    }
  };
  return conn;
}

// ==================== DATABASE INITIALIZATION ====================
function initializeUserData(user) {
  const defaults = {
    afk: -1, wait: 0, afkReason: '', age: -1, agility: 16,
    anakanjing: 0, anakcentaur: 0, anakgriffin: 0, anakkucing: 0, anakkuda: 0,
    anakkyubi: 0, anaknaga: 0, anakpancingan: 0, anakphonix: 0, anakrubah: 0,
    anakserigala: 0, anggur: 0, anjing: 0, anjinglastclaim: 0, antispam: 0,
    antispamlastclaim: 0, apel: 0, aqua: 0, arc: 0, arcdurability: 0, arlok: 0,
    armor: 0, armordurability: 0, armormonster: 0, as: 0, atm: 0, autolevelup: true,
    axe: 0, axedurability: 0, ayam: 0, ayamb: 0, ayambakar: 0, ayamg: 0, ayamgoreng: 0,
    babi: 0, babihutan: 0, babipanggang: 0, bandage: 0, bank: 0, banned: false,
    BannedReason: '', Banneduser: false, banteng: 0, batu: 0, bawal: 0, bawalbakar: 0,
    bayam: 0, berlian: 10, bibitanggur: 0, bibitapel: 0, bibitjeruk: 0, bibitmangga: 0,
    bibitpisang: 0, botol: 0, bow: 0, bowdurability: 0, boxs: 0, brick: 0, brokoli: 0,
    buaya: 0, buntal: 0, cat: 0, catlastfeed: 0, catngexp: 0, centaur: 0, centaurexp: 0,
    centaurlastclaim: 0, centaurlastfeed: 0, clay: 0, coal: 0, coin: 0, common: 0,
    crystal: 0, cumi: 0, cupon: 0, diamond: 3, dog: 0, dogexp: 0, doglastfeed: 0,
    dory: 0, dragon: 0, dragonexp: 0, dragonlastfeed: 0, emas: 0, emerald: 0, esteh: 0,
    exp: 0, expg: 0, exphero: 0, expired: 0, eleksirb: 0, emasbatang: 0, emasbiasa: 0,
    fideos: 0, fishingrod: 0, fishingroddurability: 0, fortress: 0, fox: 0, foxexp: 0,
    foxlastfeed: 0, fullatm: 0, gadodado: 0, gajah: 0, gamemines: false, mute: false,
    ganja: 0, gardenboxs: 0, gems: 0, glass: 0, gold: 0, griffin: 0, griffinexp: 0,
    griffinlastclaim: 0, griffinlastfeed: 0, gulai: 0, gurita: 0, harimau: 0, haus: 100,
    healt: 100, health: 100, healtmonster: 100, hero: 1, herolastclaim: 0, hiu: 0,
    horse: 0, horseexp: 0, horselastfeed: 0, ikan: 0, ikanbakar: 0, intelligence: 10,
    iron: 0, jagung: 0, jagungbakar: 0, jeruk: 0, job: 'Pengangguran', joincount: 2,
    joinlimit: 1, judilast: 0, kaleng: 0, kambing: 0, kangkung: 0, kapak: 0, kardus: 0,
    katana: 0, katanadurability: 0, kayu: 0, kentang: 0, kentanggoreng: 0, kepiting: 0,
    kepitingbakar: 0, kerbau: 0, kerjadelapan: 0, kerjadelapanbelas: 0, kerjadua: 0,
    kerjaduabelas: 0, kerjaduadelapan: 0, kerjaduadua: 0, kerjaduaempat: 0, kerjaduaenam: 0,
    kerjadualima: 0, kerjaduapuluh: 0, kerjaduasatu: 0, kerjaduasembilan: 0, kerjaduatiga: 0,
    kerjaduatujuh: 0, kerjaempat: 0, kerjaempatbelas: 0, kerjaenam: 0, kerjaenambelas: 0,
    kerjalima: 0, kerjalimabelas: 0, kerjasatu: 0, kerjasebelas: 0, kerjasembilan: 0,
    kerjasembilanbelas: 0, kerjasepuluh: 0, kerjatiga: 0, kerjatigabelas: 0, kerjatigapuluh: 0,
    kerjatujuh: 0, kerjatujuhbelas: 0, korbanngocok: 0, kubis: 0, kucing: 0,
    kucinglastclaim: 0, kuda: 0, kudalastclaim: 0, kumba: 0, kyubi: 0, kyubilastclaim: 0,
    labu: 0, laper: 100, lastadventure: 0, lastberbru: 0, lastberkebon: 0, lastbunga: 0,
    lastbunuhi: 0, lastcoins: 0, lastclaim: 0, lastcode: 0, lastcofre: 0, lastcrusade: 0,
    lastdaang: 0, lastdagang: 0, lastdiamantes: 0, lastduel: 0, lastdungeon: 0, lasteasy: 0,
    lastfight: 0, lastfishing: 0, lastgojek: 0, lastgrab: 0, lasthourly: 0, lasthunt: 0,
    lastjb: 0, lastkill: 0, lastlink: 0, lastlumber: 0, lastmancingeasy: 0,
    lastmancingextreme: 0, lastmancinghard: 0, lastmancingnormal: 0, lastmining: 0,
    lastmisi: 0, lastmonthly: 0, lastmulung: 0, lastnambang: 0, lastnebang: 0, lastngocok: 0,
    lastngojek: 0, lastopen: 0, lastpekerjaan: 0, lastpago: 0, lastpotionclaim: 0,
    lastramuanclaim: 0, lastspam: 0, lastrob: 0, lastroket: 0, lastseen: 0, lastSetStatus: 0,
    lastsironclaim: 0, lastsmancingclaim: 0, laststringclaim: 0, lastswordclaim: 0,
    lastturu: 0, lastwarpet: 0, lastweaponclaim: 0, lastweekly: 0, lastwork: 0,
    lbars: '[]', legendary: 0, lele: 0, leleb: 0, lelebakar: 0, leleg: 0,
    level: 0, limit: 20, limitjoinfree: 1, lion: 0, lionexp: 0, lionlastfeed: 0,
    lobster: 0, lumba: 0, magicwand: 0, magicwanddurability: 0, makanan: 0,
    makanancentaur: 0, makanangriffin: 0, makanankyubi: 0, makanannaga: 0, makananpet: 0,
    makananphonix: 0, makananserigala: 0, mana: 20, mangga: 0, misi: '', money: 15,
    monyet: 0, mythic: 0, naga: 0, nagalastclaim: 0, name: '', net: 0, nila: 0,
    nilabakar: 0, note: 0, ojekk: 0, oporayam: 0, orca: 0, pancingan: 1, panda: 0,
    pasangan: '', paus: 0, pausbakar: 0, pc: 0, pepesikan: 0, pet: 0, phonix: 0,
    phonixexp: 0, phonixlastclaim: 0, phonixlastfeed: 0, pickaxe: 0, pickaxedurability: 0,
    pillhero: 0, pisang: 0, pointxp: 0, potion: 10, premium: false, premiumTime: 0,
    ramuan: 0, ramuancentaurlast: 0, ramuangriffinlast: 0, ramuanherolast: 0,
    ramuankucinglast: 0, ramuankudalast: 0, ramuankyubilast: 0, ramuannagalast: 0,
    ramuanphonixlast: 0, ramuanrubahlast: 0, ramuanserigalalast: 0, registered: false,
    reglast: 0, regTime: -1, rendang: 0, rhinoceros: 0, rhinocerosexp: 0,
    rhinoceroslastfeed: 0, rock: 0, roket: 0, role: 'Novato', roti: 0, rtrofi: 'bronce',
    rubah: 0, rubahlastclaim: 0, rumahsakit: 0, sampah: 0, sand: 0, sapi: 0, sapir: 0,
    seedbayam: 0, seedbrokoli: 0, seedjagung: 0, seedkangkung: 0, seedkentang: 0,
    seedkubis: 0, seedlabu: 0, seedtomat: 0, seedwortel: 0, semangka: 0, serigala: 0,
    serigalalastclaim: 0, sewa: false, shield: 0, skill: '', skillexp: 0, snlast: 0,
    soda: 0, sop: 0, spammer: 0, spinlast: 0, ssapi: 0, stamina: 100, steak: 0,
    stick: 0, strength: 30, string: 0, stroberi: 0, superior: 0, suplabu: 0, sushi: 0,
    sword: 0, sworddurability: 0, tigame: 50, tiketcoin: 0, title: '', tomat: 0,
    tprem: 0, trash: 0, trofi: 0, troopcamp: 0, tumiskangkung: 0, udang: 0,
    udangbakar: 0, umpan: 0, uncoommon: 0, unreglast: 0, upgrader: 0, vodka: 0,
    wallet: 0, warn: 0, weapon: 0, weapondurability: 0, wolf: 0, wolfexp: 0,
    wolflastfeed: 0, wood: 0, wortel: 0, gameglx: {},
    saki: 35,
    lastDailySaki: 0
  };
  
  for (const key in defaults) {
    if (user[key] === undefined) user[key] = defaults[key];
  }
  return user;
}

function initializeAkinatorData(akinator) {
  const defaults = {
    sesi: false, server: null, frontaddr: null, session: null,
    signature: null, question: null, progression: null, step: null, soal: null
  };
  for (const key in defaults) {
    if (akinator[key] === undefined) akinator[key] = defaults[key];
  }
  return akinator;
}

function initializeGameData(gameglx) {
  const defaults = {
    status: false,
    notificacao: { recebidas: [] },
    perfil: {
      xp: 112,
      nivel: { nome: 'Iniciante', id: 0, proximoNivel: 1 },
      poder: 500,
      minerando: false,
      nome: null,
      username: null,
      id: null,
      casa: {
        id: null,
        planeta: null,
        idpelonome: 'terra',
        colonia: { id: 1, nome: null, habitante: false, posicao: { x: 0, y: 0 } }
      },
      carteira: { currency: 'BRL', saldo: 1500 },
      localizacao: {
        status: false,
        nomeplaneta: null,
        id: null,
        idpelonome: null,
        viajando: false,
        posicao: { x: 0, y: 0 }
      },
      nave: { status: false, id: null, nome: null, velocidade: null, poder: null, valor: null },
      bolsa: {
        itens: { madeira: 1, ferro: 1, diamante: 1, esmeralda: 2, carvao: 1, ouro: 1, quartzo: 1 },
        naves: { status: false, compradas: [] }
      },
      ataque: {
        data: { hora: 0, contagem: 0 },
        sendoAtacado: { status: false, atacante: null },
        forcaAtaque: { ataque: 10 }
      },
      defesa: { forca: 200, ataque: 30 }
    }
  };
  for (const key in defaults) {
    if (gameglx[key] === undefined) gameglx[key] = defaults[key];
  }
  return gameglx;
}

function initializeChatData(chat) {
  const defaults = {
    isBanned: false, welcome: true, detect: true, detect2: false,
    sWelcome: '', sBye: '', sPromote: '', sDemote: '',
    antidelete: false, modohorny: true, autosticker: false, audios: true,
    antiLink: false, antiLink2: false, antiviewonce: false, antiToxic: false,
    antiTraba: false, antiArab: false, antiArab2: false, antiporno: false,
    modoadmin: false, simi: false, game: true, expired: 0, setPrimaryBot: ''
  };
  for (const key in defaults) {
    if (chat[key] === undefined) chat[key] = defaults[key];
  }
  return chat;
}

function initializeSettingsData(settings) {
  const defaults = {
    self: false, autoread: false, autoread2: false, restrict: false,
    antiCall: false, antiPrivate: false, modejadibot: true, antispam: false,
    audios_bot: true, modoia: false
  };
  for (const key in defaults) {
    if (settings[key] === undefined) settings[key] = defaults[key];
  }
  return settings;
}

// ==================== MAIN HANDLER ====================
export async function handler(chatUpdate) {
  if (!chatUpdate) return;
  let m = chatUpdate.messages[chatUpdate.messages.length - 1];
  if (!m) return;
  
  this.sendMessage = enhanceSendMessage(this).sendMessage;
  this.msgqueque = this.msgqueque || [];
  this.uptime = this.uptime || Date.now();
  
  if (global.db.data == null) await global.loadDatabase();
  
  try {
    m = smsg(this, m) || m;
    if (!m) return;
    
    global.mconn = m;
    m.exp = 0;
    m.saki = false;
    
    try {
      const user = global.db.data.users[m.sender];
      if (typeof user !== 'object') global.db.data.users[m.sender] = {};
      if (user) initializeUserData(user);
      
      const akinator = global.db.data.users[m.sender].akinator;
      if (typeof akinator !== 'object') global.db.data.users[m.sender].akinator = {};
      if (akinator) initializeAkinatorData(akinator);
      
      const gameglx = global.db.data.users[m.sender].gameglx;
      if (typeof gameglx !== 'object') global.db.data.users[m.sender].gameglx = {};
      if (gameglx) initializeGameData(gameglx);

      const chat = global.db.data.chats[m.chat];
      if (typeof chat !== 'object') global.db.data.chats[m.chat] = {};
      if (chat) initializeChatData(chat);
      
      const settings = global.db.data.settings[this.user.jid];
      if (typeof settings !== 'object') global.db.data.settings[this.user.jid] = {};
      if (settings) initializeSettingsData(settings);
    } catch (e) {
      console.error(e);
    }

    if (opts['nyimak']) return;
    if (!m.fromMe && opts['self']) return;
    if (opts['pconly'] && m.chat.endsWith('g.us')) return;
    if (opts['gconly'] && !m.chat.endsWith('g.us')) return;
    if (opts['swonly'] && m.chat !== 'status@broadcast') return;
    
    if (typeof m.text !== 'string') m.text = '';

    const senderNumber = m.sender.split('@')[0].replace(/[^0-9]/g, '');
    const isROwner = ownerConfig.isOwner(senderNumber);
    const isOwner = isROwner || m.fromMe;
    const isMods = isOwner || (global.mods || []).map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);
    const isPrems = isROwner || isOwner || isMods || (global.db.data.users[m.sender]?.premiumTime || 0) > 0;

    if (opts['queque'] && m.text && !(isMods || isPrems)) {
      const queque = this.msgqueque;
      const time = 1000 * 5;
      const previousID = queque[queque.length - 1];
      queque.push(m.id || m.key.id);
      setInterval(async function() {
        if (queque.indexOf(previousID) === -1) clearInterval(this);
        await delay(time);
      }, time);
    }

    if (m.isBaileys && !m.fromMe) return;
    m.exp += Math.ceil(Math.random() * 10);

    let usedPrefix;
    const _user = global.db.data?.users?.[m.sender];
    const groupMetadata = m.isGroup ? {
      ...(this.chats[m.chat]?.metadata || await this.groupMetadata(m.chat).catch(() => null) || {}),
      ...(((this.chats[m.chat]?.metadata || await this.groupMetadata(m.chat).catch(() => null) || {}).participants) && {
        participants: ((this.chats[m.chat]?.metadata || await this.groupMetadata(m.chat).catch(() => null) || {}).participants || []).map(p => ({ ...p, id: p.jid, jid: p.jid, lid: p.lid }))
      })
    } : {};
    
    const participants = ((m.isGroup ? groupMetadata.participants : []) || []).map(participant => ({
      id: participant.jid,
      jid: participant.jid,
      lid: participant.lid,
      admin: participant.admin
    }));
    
    const user = (m.isGroup ? participants.find(u => this.decodeJid(u.jid) === m.sender) : {}) || {};
    const bot = (m.isGroup ? participants.find(u => this.decodeJid(u.jid) === this.user.jid) : {}) || {};
    const isRAdmin = user?.admin === 'superadmin' || false;
    const isAdmin = isRAdmin || user?.admin === 'admin' || false;
    const isBotAdmin = bot?.admin || false;

    const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), './plugins');
    
    for (const name in global.plugins) {
      const plugin = global.plugins[name];
      if (!plugin || plugin.disabled) continue;
      
      const __filename = join(___dirname, name);
      
      if (typeof plugin.all === 'function') {
        try {
          await plugin.all.call(this, m, { chatUpdate, __dirname: ___dirname, __filename });
        } catch (e) {
          console.error(e);
        }
      }
      
      if (!opts['restrict'] && plugin.tags?.includes('admin')) continue;
      
      const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
      const _prefix = plugin.customPrefix || this.prefix || global.prefix;
      
      const match = (_prefix instanceof RegExp
        ? [[_prefix.exec(m.text), _prefix]]
        : Array.isArray(_prefix)
          ? _prefix.map(p => {
              const re = p instanceof RegExp ? p : new RegExp(str2Regex(p));
              return [re.exec(m.text), re];
            })
          : typeof _prefix === 'string'
            ? [[new RegExp(str2Regex(_prefix)).exec(m.text), new RegExp(str2Regex(_prefix))]]
            : [[[], new RegExp]]
      ).find(p => p[1]);
      
      if (typeof plugin.before === 'function') {
        if (await plugin.before.call(this, m, {
          match, conn: this, participants, groupMetadata, user, bot,
          isROwner, isOwner, isRAdmin, isAdmin, isBotAdmin, isPrems,
          chatUpdate, __dirname: ___dirname, __filename
        })) continue;
      }
      
      if (typeof plugin !== 'function') continue;
      
      if ((usedPrefix = (match[0] || '')[0])) {
        const noPrefix = m.text.replace(usedPrefix, '');
        let [command, ...args] = noPrefix.trim().split(' ').filter(v => v);
        args = args || [];
        const _args = noPrefix.trim().split(' ').slice(1);
        const text = _args.join(' ');
        command = (command || '').toLowerCase();
        const fail = plugin.fail || global.dfail;
        
        const isAccept = plugin.command instanceof RegExp
          ? plugin.command.test(command)
          : Array.isArray(plugin.command)
            ? plugin.command.some(cmd => cmd instanceof RegExp ? cmd.test(command) : cmd === command)
            : typeof plugin.command === 'string'
              ? plugin.command === command
              : false;

        if (!isAccept) continue;

        if (global.devCommands?.includes(command) && !isOwner && !isROwner) {
          await m.reply('⚠️ *Command in Maintenance*\n\nThis feature is currently under development.\nPlease try again later.');
          continue;
        }

        if (m.id.startsWith('EVO') || m.id.startsWith('Lyru-') || 
            (m.id.startsWith('BAE5') && m.id.length === 16) || 
            m.id.startsWith('B24E') || 
            (m.id.startsWith('8SCO') && m.id.length === 20) || 
            m.id.startsWith('FizzxyTheGreat-')) return;

        m.plugin = name;
        
        if (m.chat in global.db.data.chats || m.sender in global.db.data.users) {
          const chat = global.db.data.chats[m.chat] || {};
          const userData = global.db.data.users[m.sender] || {};
          const botSpam = global.db.data.settings[this.user.jid] || {};

          if (!['owner-unbanchat.js', 'info-creator.js'].includes(name) && chat?.isBanned && !isROwner) return;
          if (!['owner-unbanchat.js', 'owner-exec.js', 'owner-exec2.js'].includes(name) && chat?.isBanned && !isROwner) return;
          
          if (m.text && userData?.banned && !isROwner) {
            if (typeof userData.bannedMessageCount === 'undefined') userData.bannedMessageCount = 0;
            if (userData.bannedMessageCount < 3) {
              const messageNumber = userData.bannedMessageCount + 1;
              const messageText = getErrorMessage('banned', { reason: userData.bannedReason || 'No especificado' }) + `\n*Mensaje ${messageNumber}/3*`;
              m.reply(messageText);
              userData.bannedMessageCount++;
            } else if (userData.bannedMessageCount === 3) {
              userData.bannedMessageSent = true;
            } else {
              return;
            }
            return;
          }

          const cooldown = botConfig.defaultLimits.commandCooldown * 1000;
          if (botSpam?.antispam && m.text && userData?.lastCommandTime && 
              (Date.now() - userData.lastCommandTime) < cooldown && !isROwner) {
            if (userData.commandCount === 2) {
              const remaining = Math.ceil((userData.lastCommandTime + cooldown - Date.now()) / 1000);
              if (remaining > 0) {
                m.reply(getErrorMessage('cooldown', { time: remaining }));
                return;
              }
              userData.commandCount = 0;
            } else {
              userData.commandCount = (userData.commandCount || 0) + 1;
            }
          } else if (userData) {
            userData.lastCommandTime = Date.now();
            userData.commandCount = 1;
          }
        }
        
        const adminMode = global.db.data.chats[m.chat]?.modoadmin;
        const mystica = `${plugin.botAdmin || plugin.admin || plugin.group || plugin || noPrefix || m.text.slice(0, 1) === _prefix || plugin.command}`;
        if (adminMode && !isOwner && !isROwner && m.isGroup && !isAdmin && mystica) return;

        const checks = [
          { cond: plugin.premium && !isPrems, type: 'premium' },
          { cond: plugin.rowner && !isROwner, type: 'rowner' },
          { cond: plugin.owner && !isOwner, type: 'owner' },
          { cond: plugin.mods && !isMods, type: 'mods' },
          { cond: plugin.group && !m.isGroup, type: 'group' },
          { cond: plugin.botAdmin && !isBotAdmin, type: 'botAdmin' },
          { cond: plugin.admin && !isAdmin, type: 'admin' },
          { cond: plugin.private && m.isGroup, type: 'private' }
        ];

        let failed = false;
        for (const check of checks) {
          if (check.cond) {
            fail(check.type, m, this);
            failed = true;
            break;
          }
        }
        if (failed) continue;
        
        const allowedCommands = ['reg', 'help', 'start', 'ping', 'menu'];
        if (!allowedCommands.includes(command) && !isROwner && !isOwner) {
          const userData = global.db.data.users[m.sender];
          if (!userData?.registered) {
            await m.reply(getErrorMessage('notRegistered'));
            continue;
          }
        }
        
        if (plugin.register === true && !_user?.registered) {
          fail('unreg', m, this);
          continue;
        }
        
        m.isCommand = true;
        const xp = 'exp' in plugin ? parseInt(plugin.exp) : 17;
        m.exp += xp > 200 ? 0 : xp;
        
        if (!isPrems && plugin.saki && (global.db.data.users[m.sender]?.saki || 0) < plugin.saki) {
          const currentSaki = global.db.data.users[m.sender]?.saki || 0;
          this.reply(m.chat, `💰 *Insufficient Saki*\n\nYou need ${plugin.saki} SAKI to use this command.\nYour balance: ${currentSaki} SAKI\n\nUse .daily to claim daily reward or .buysaki to purchase more.`, m);
          continue;
        }
        
        if (plugin.level > (_user?.level || 0)) {
          this.reply(m.chat, getErrorMessage('insufficientLevel', { level: plugin.level }), m);
          continue;
        }
        
        const chatPrim = global.db.data.chats[m.chat] || {};
        const normalizeJid = jid => jid?.replace(/[^0-9]/g, '');
        const isActiveBot = jid => {
          const normalized = normalizeJid(jid) + '@s.whatsapp.net';
          return normalized === global.conn.user.jid || (global.conns || []).some(b => b.user?.jid === normalized);
        };
        
        if (chatPrim.setPrimaryBot) {
          const primaryNum = normalizeJid(chatPrim.setPrimaryBot) + '@s.whatsapp.net';
          const currentNum = normalizeJid(this.user.jid) + '@s.whatsapp.net';
          if (!isActiveBot(chatPrim.setPrimaryBot)) {
            delete chatPrim.setPrimaryBot;
            global.db.data.chats[m.chat] = chatPrim;
          } else if (primaryNum && currentNum !== primaryNum) {
            return;
          }
        }
        
        const extra = {
          match, usedPrefix, noPrefix, _args, args, command, text,
          conn: this, participants, groupMetadata, user, bot,
          isROwner, isOwner, isRAdmin, isAdmin, isBotAdmin, isPrems,
          chatUpdate, __dirname: ___dirname, __filename,
          settings: { owner: ownerConfig, bot: botConfig, getErrorMessage,
            getSuccessMessage, getMainOwner, getCurrentDate, getCurrentTime, formatUptime }
        };
        
        try {
          await plugin.call(this, m, extra);
          if (!isPrems) m.saki = m.saki || plugin.saki || false;
        } catch (e) {
          m.error = e;
          console.error(e);
          if (e) {
            let text = format(e);
            for (const key of Object.values(global.APIKeys || {})) {
              text = text.replace(new RegExp(key, 'g'), '#HIDDEN#');
            }
            await m.reply(text);
          }
        } finally {
          if (typeof plugin.after === 'function') {
            try { await plugin.after.call(this, m, extra); } catch (e) { console.error(e); }
          }
          // ✅ التعديل هنا - استخدام الرصيد المحدث مباشرة
          if (m.saki) {
            const remaining = global.db.data.users[m.sender]?.saki || 50;
            m.reply(`💰 *Saki Used*\n\nYou spent ${m.saki} SAKI on this command.\nRemaining SAKI: ${remaining}`);
          }
        }
        break;
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (opts['queque'] && m?.text) {
      const idx = this.msgqueque.indexOf(m.id || m.key.id);
      if (idx !== -1) this.msgqueque.splice(idx, 1);
    }
    
    if (m) {
      const userData = global.db.data.users[m.sender];
      if (userData) {
        userData.exp += m.exp || 1;
        userData.saki -= (m.saki * 1) || 0;
      }

      if (m.plugin) {
        const now = Date.now();
        const stats = global.db.data.stats;
        if (!stats[m.plugin]) {
          stats[m.plugin] = { total: 1, success: m.error ? 0 : 1, last: now, lastSuccess: m.error ? 0 : now };
        } else {
          stats[m.plugin].total++;
          stats[m.plugin].last = now;
          if (!m.error) {
            stats[m.plugin].success++;
            stats[m.plugin].lastSuccess = now;
          }
        }
      }
    }

    try {
      if (!opts['noprint']) await (await import('./src/libraries/print.js')).default(m, this);
    } catch (e) {
      console.log(m, m?.quoted, e);
    }
    
    const settingsREAD = global.db.data.settings[this.user?.jid] || {};
    if (opts['autoread'] && m?.key) await this.readMessages([m.key]);
    if (settingsREAD.autoread2 && m?.key) await this.readMessages([m.key]);
  }
}

// ==================== PARTICIPANTS UPDATE HANDLER ====================
export async function participantsUpdate({ id, participants, action }) {
  if (opts['self']) return;
  if (global.db.data == null) await global.loadDatabase();
  
  const m = global.mconn;
  const chat = global.db.data.chats[id] || {};
  const botTt = global.db.data.settings[global.mconn?.conn?.user?.jid] || {};
  let text = '';
  
  if (!['add', 'remove', 'promote', 'demote'].includes(action)) return;
  
  if ((action === 'add' || action === 'remove') && chat.welcome && !chat.isBanned) {
    if (action === 'remove' && participants.includes(global.mconn?.conn?.user?.jid)) return;
    
    const groupMetadata = await global.mconn?.conn?.groupMetadata(id).catch(() => null) || this.chats[id]?.metadata;
    if (!groupMetadata) return;
    
    for (const user of participants) {
      try {
        const pp = await global.mconn?.conn?.profilePictureUrl(user, 'image').catch(() => 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60');
        const apii = await global.mconn?.conn?.getFile(pp);
        
        const antiArab = JSON.parse(fs.readFileSync('./src/antiArab.json'));
        const userPrefix = antiArab.some(prefix => user.startsWith(prefix));
        const botTt2 = groupMetadata.participants?.find(u => global.mconn?.conn?.decodeJid(u.id) === global.mconn?.conn?.user?.jid) || {};
        const isBotAdmin = botTt2?.admin === 'admin';
        
        text = (action === 'add' ? (chat.sWelcome || botConfig.defaultWelcome) : (chat.sBye || botConfig.defaultBye))
          .replace('@subject', await global.mconn?.conn?.getName(id))
          .replace('@desc', groupMetadata.desc?.toString() || '*Sin descripción*')
          .replace('@user', '@' + user.split('@')[0]);
        
        if (userPrefix && chat.antiArab && botTt.restrict && isBotAdmin && action === 'add') {
          await global.mconn?.conn?.groupParticipantsUpdate(id, [user], 'remove');
          const fkontak2 = {
            key: { participants: '0@s.whatsapp.net', remoteJid: 'status@broadcast', fromMe: false, id: 'Halo' },
            message: {
              contactMessage: {
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:y\nitem1.TEL;waid=${user.split('@')[0]}:${user.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
              }
            },
            participant: '0@s.whatsapp.net'
          };
          await global.mconn?.conn?.sendMessage(id, {
            text: `*[] @${user.split('@')[0]} En este grupo no se permiten números árabes o raros, por lo que será eliminado del grupo.*`,
            mentions: [user]
          }, { quoted: fkontak2 });
          return;
        }
        
        await global.mconn?.conn?.sendFile(id, apii.data, 'pp.jpg', text, null, false, { mentions: [user] });
      } catch (e) {
        console.log(e);
      }
    }
  }
  
  if ((action === 'promote' || action === 'demote') && chat.detect && !chat.isBanned) {
    text = action === 'promote'
      ? (chat.sPromote || '¡@user ahora es admin!')
      : (chat.sDemote || '¡@user ya no es admin!');
    text = text.replace('@user', '@' + participants[0].split('@')[0]);
    await global.mconn?.conn?.sendMessage(id, { text, mentions: [participants[0]] });
  }
}

// ==================== GROUPS UPDATE HANDLER ====================
export async function groupsUpdate(groupsUpdate) {
  if (opts['self']) return;
  for (const update of groupsUpdate) {
    const id = update.id;
    if (!id || update.size === NaN || update.subjectTime) continue;
    const chats = global.db.data.chats[id];
    if (!chats?.detect) continue;
    
    let text = '';
    if (update.desc) text = (chats.sDesc || 'La descripción ha sido cambiada a:\n@desc').replace('@desc', update.desc);
    else if (update.subject) text = (chats.sSubject || 'El título ha sido cambiado a:\n@subject').replace('@subject', update.subject);
    else if (update.icon) text = chats.sIcon || 'El icono ha sido cambiado';
    else if (update.revoke) text = (chats.sRevoke || 'El enlace del grupo ha sido cambiado a:\n@revoke').replace('@revoke', update.revoke);
    
    if (text) await global.mconn?.conn?.sendMessage(id, { text, mentions: global.mconn?.conn?.parseMention(text) });
  }
}

// ==================== CALL UPDATE HANDLER ====================
export async function callUpdate(callUpdate) {
  const isAnticall = global.db?.data?.settings[global.mconn?.conn?.user?.jid]?.antiCall;
  if (!isAnticall) return;
  for (const call of callUpdate) {
    if (!call.isGroup && call.status === 'offer') {
      const reply = await global.mconn?.conn?.reply(
        call.from,
        `Hola *@${call.from.split('@')[0]}*, las ${call.isVideo ? 'videollamadas' : 'llamadas'} no están permitidas, serás bloqueado.\n-\nSi accidentalmente llamaste póngase en contacto con mi creador para que te desbloquee!`,
        false,
        { mentions: [call.from] }
      );
      await global.mconn.conn.sendMessage(call.from, {
        contacts: {
          displayName: getMainOwner().creatorName,
          contacts: [{ vcard: 'Saziki' }]
        }
      }, { quoted: reply });
      await global.mconn.conn.updateBlockStatus(call.from, 'block');
    }
  }
}

// ==================== DELETE UPDATE HANDLER ====================
export async function deleteUpdate(message) {
  const { fromMe, id, participant } = message;
  if (fromMe) return;
  try {
    const msg = global.mconn.conn.serializeM(await global.mconn.conn.loadMessage(id));
    if (!msg?.isGroup) return;
    const chat = global.db.data.chats[msg.chat] || {};
    if (!chat?.antidelete) return;
    const antideleteMessage = `${botConfig.emojis.info} *Mensaje eliminado detectado*\n*De:* @${participant.split('@')[0]}\n*Hora:* ${getCurrentTime()}\n*Fecha:* ${getCurrentDate()}\n\n*Mensaje original:*`.trim();
    await global.mconn.conn.sendMessage(msg.chat, {
      text: antideleteMessage,
      mentions: [participant]
    }, { quoted: msg });
    global.mconn.conn.copyNForward(msg.chat, msg).catch(e => console.log(e, msg));
  } catch (e) {
    console.error(e);
  }
}

// ==================== DFAIL FUNCTION ====================
global.dfail = (type, m, conn) => {
  const msg = getErrorMessage(type);
  const prep = generateWAMessageFromContent(m.chat, {
    extendedTextMessage: {
      text: msg,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: NEWSLETTER_JID,
          newsletterName: BOT_NAME,
          serverMessageId: 100
        },
        externalAdReply: {
          title: BOT_NAME,
          body: '📢 𝐒𝐀𝐙𝐈𝐊𝐈 𝐁𝐎𝐓 𝐁𝐘 𝐀𝐋𝐈 𝐍𝐀𝐅𝐈𝐒 ⵥ',
          thumbnailUrl: CHANNEL_THUMBNAIL,
          sourceUrl: CHANNEL_LINK,
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }
  }, { quoted: m, userJid: conn.user.jid });

  const chatPrim = global.db.data.chats[m.chat] || {};
  const normalizeJid = jid => jid?.replace(/[^0-9]/g, '');
  const isActiveBot = jid => {
    const normalized = normalizeJid(jid) + '@s.whatsapp.net';
    return normalized === global.conn.user.jid || (global.conns || []).some(b => b.user?.jid === normalized);
  };
  
  if (chatPrim.setPrimaryBot) {
    const primaryNum = normalizeJid(chatPrim.setPrimaryBot) + '@s.whatsapp.net';
    const currentNum = normalizeJid(conn.user.jid) + '@s.whatsapp.net';
    if (!isActiveBot(chatPrim.setPrimaryBot)) {
      delete chatPrim.setPrimaryBot;
      global.db.data.chats[m.chat] = chatPrim;
    } else if (primaryNum && currentNum !== primaryNum) return;
  }
  
  return conn.relayMessage(m.chat, prep.message, { messageId: prep.key.id });
};

// ==================== FILE WATCHER ====================
const file = global.__filename(import.meta.url, true);
watchFile(file, async () => {
  unwatchFile(file);
  console.log(chalk.redBright('Update \'handler.js\''));
  if (global.reloadHandler) console.log(await global.reloadHandler());

  if (global.conns?.length) {
    const users = [...new Set(global.conns.filter(c => c.user && c.ws.socket?.readyState === ws.OPEN))];
    for (const user of users) {
      user.subreloadHandler?.(false);
    }
  }
});
