'use strict';

/**
 * Ping natif d'un serveur Minecraft Java via le protocole Server List Ping.
 *
 * Pourquoi pas mcsrvstat.us : leur DNS resolver ignore les SRV records de
 * playit.gg et tape direct le AAAA IPv6 (qui n'ecoute pas MC). Resultat :
 * faux "hors ligne" alors que le serveur tourne tres bien.
 *
 * Workflow :
 *   1. dns.resolveSrv("_minecraft._tcp.<host>") -> recupere l'endpoint reel
 *   2. net.connect -> handshake MC + status request
 *   3. parse JSON response -> { online, players, max, version }
 */

const net = require('net');
const dns = require('dns').promises;

function writeVarInt(val) {
  const buf = [];
  while ((val & ~0x7F) !== 0) {
    buf.push((val & 0x7F) | 0x80);
    val >>>= 7;
  }
  buf.push(val & 0x7F);
  return Buffer.from(buf);
}

function writeString(str) {
  const b = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(b.length), b]);
}

class Reader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  readVarInt() {
    let val = 0, shift = 0;
    while (true) {
      if (this.pos >= this.buf.length) throw new Error('eof');
      const b = this.buf[this.pos++];
      val |= (b & 0x7F) << shift;
      if ((b & 0x80) === 0) return val;
      shift += 7;
      if (shift > 35) throw new Error('VarInt too long');
    }
  }
  readString() {
    const len = this.readVarInt();
    if (this.pos + len > this.buf.length) throw new Error('string overflow');
    const str = this.buf.slice(this.pos, this.pos + len).toString('utf8');
    this.pos += len;
    return str;
  }
}

async function resolveSrv(host) {
  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (records && records.length > 0) {
      return { host: records[0].name, port: records[0].port };
    }
  } catch (_) {}
  return null;
}

async function pingMcServer(host, port, timeoutMs = 5000) {
  // Resolve SRV first (essentiel pour playit.gg)
  const srv = await resolveSrv(host);
  const target = srv || { host, port };

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: target.host, port: target.port, family: 0 });
    socket.setTimeout(timeoutMs);

    let data = Buffer.alloc(0);
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) {}
      resolve(result);
    };

    socket.once('connect', () => {
      // Packet 0x00 Handshake
      const handshakeData = Buffer.concat([
        writeVarInt(0x00),           // packet ID
        writeVarInt(763),             // protocol version 1.20.1 = 763
        writeString(target.host),
        Buffer.from([(target.port >> 8) & 0xFF, target.port & 0xFF]),
        writeVarInt(1),               // next state = status
      ]);
      socket.write(Buffer.concat([writeVarInt(handshakeData.length), handshakeData]));
      // Packet 0x00 Status Request (empty)
      socket.write(Buffer.from([0x01, 0x00]));
    });

    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      try {
        const r = new Reader(data);
        const totalLen = r.readVarInt();
        if (data.length - r.pos < totalLen) return; // attendre plus
        const pid = r.readVarInt();
        if (pid !== 0) { finish({ online: false, players: 0, max: 0 }); return; }
        const json = r.readString();
        const parsed = JSON.parse(json);
        finish({
          online: true,
          players: (parsed.players && parsed.players.online != null) ? parsed.players.online : 0,
          max: (parsed.players && parsed.players.max != null) ? parsed.players.max : 0,
          version: parsed.version ? parsed.version.name : '',
        });
      } catch (e) {
        // pas encore assez de donnees, on attend
      }
    });

    socket.once('error', () => finish({ online: false, players: 0, max: 0 }));
    socket.once('timeout', () => finish({ online: false, players: 0, max: 0 }));
  });
}

module.exports = { pingMcServer };
