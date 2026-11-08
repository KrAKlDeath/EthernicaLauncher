'use strict';

const path = require('path');
const fs = require('fs');
const { Client } = require('minecraft-launcher-core');
const config = require('./config');
const store = require('./store');
const neoforge = require('./neoforge');

/**
 * Lance Minecraft via minecraft-launcher-core.
 * MCLC gère :
 *   - download MC vanilla (jar + libs + assets + natives)
 *   - profil NeoForge installé au préalable (neoforge.js), lancé comme version « custom »
 *   - build de la classpath + JVM args
 *   - spawn du process java
 */
class LauncherRunner {
  constructor() {
    this.client = new Client();
    this._wire();
  }

  _wire() {
    this.client.on('debug', (m) => process.stdout.write(`[mclc][debug] ${m}\n`));
    this.client.on('data', (m) => process.stdout.write(`[mclc][game] ${m}`));
    this.client.on('progress', (p) => {
      if (this._onProgress) {
        this._onProgress({
          step: 'mc-' + p.type,
          current: p.task,
          total: p.total,
        });
      }
    });
    this.client.on('close', (code) => {
      if (this._onClose) this._onClose(code);
    });
  }

  /**
   * @param {object} opts
   * @param {string} opts.gameDir   Dossier root (.ethernia/)
   * @param {string} opts.javaBin   Chemin javaw.exe
   * @param {string} opts.versionId Id du profil NeoForge (ex. neoforge-21.1.228)
   * @param {object} opts.auth      Payload mclc-compatible (cf auth.js)
   * @param {function} opts.onProgress
   * @param {function} opts.onClose
   */
  async launch(opts) {
    this._onProgress = opts.onProgress;
    this._onClose = opts.onClose;

    const ramGb = store.get('ramGb') || 6;
    const extra = (store.get('extraJvmArgs') || '').trim();

    const minecraftDir = path.join(opts.gameDir, '.minecraft');
    await fs.promises.mkdir(minecraftDir, { recursive: true });

    this._writeServersDat(minecraftDir);

    const jvm = neoforge.jvmArgs(minecraftDir, opts.versionId);

    const launchOpts = {
      authorization: opts.auth,
      root: minecraftDir,
      version: {
        number: config.MC_VERSION,
        type: 'release',
        custom: opts.versionId,
      },
      memory: {
        max: `${ramGb}G`,
        min: `${Math.max(2, Math.floor(ramGb / 2))}G`,
      },
      javaPath: opts.javaBin,
      overrides: {
        detached: !store.get('closeOnLaunch'),
        gameDirectory: minecraftDir,
        cwd: minecraftDir,
      },
      // Arguments du profil NeoForge (module path…) puis ceux du joueur
      customArgs: jvm.concat(extra ? extra.split(/\s+/) : []),
    };

    return this.client.launch(launchOpts);
  }

  /**
   * Pré-écrit servers.dat pour que le serveur Ethernia apparaisse en premier
   * dans la liste multijoueur. NBT minimal — pas besoin d'une lib NBT complète.
   */
  _writeServersDat(minecraftDir) {
    const serversDat = path.join(minecraftDir, 'servers.dat');
    if (fs.existsSync(serversDat)) return; // ne pas écraser si l'utilisateur a déjà ajouté ses serveurs

    const name = config.SERVER_NAME;
    const ip = `${config.SERVER_HOST}:${config.SERVER_PORT}`;
    const buf = buildServersNbt(name, ip);
    fs.writeFileSync(serversDat, buf);
  }
}

/**
 * Construit un fichier NBT non-compressé représentant :
 *   { servers: [ { name: <name>, ip: <ip>, acceptTextures: 1b } ] }
 *
 * Format NBT : tag-id (1 byte) + name-len (2 bytes BE) + name-bytes + payload.
 * Le format servers.dat de MC accepte le NBT non-compressé en racine.
 */
function buildServersNbt(name, ip) {
  const chunks = [];

  // Root TAG_Compound
  chunks.push(Buffer.from([10])); // type compound
  chunks.push(strBytes('')); // root name

  // List "servers"
  chunks.push(Buffer.from([9])); // type list
  chunks.push(strBytes('servers'));
  chunks.push(Buffer.from([10])); // element type = compound
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeInt32BE(1, 0);
  chunks.push(lenBuf);

  // Compound element: { name, ip, acceptTextures: 1b }
  chunks.push(Buffer.from([8])); // tag_string
  chunks.push(strBytes('name'));
  chunks.push(strBytes(name));

  chunks.push(Buffer.from([8])); // tag_string
  chunks.push(strBytes('ip'));
  chunks.push(strBytes(ip));

  chunks.push(Buffer.from([1])); // tag_byte
  chunks.push(strBytes('acceptTextures'));
  chunks.push(Buffer.from([1]));

  chunks.push(Buffer.from([0])); // end compound element
  chunks.push(Buffer.from([0])); // end root compound

  return Buffer.concat(chunks);
}

function strBytes(s) {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length, 0);
  return Buffer.concat([len, b]);
}

module.exports = { LauncherRunner };
