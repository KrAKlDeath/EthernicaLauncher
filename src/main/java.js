'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');
const extract = require('extract-zip');
const config = require('./config');

/**
 * Détection / téléchargement Java 21 (Temurin JRE).
 * On installe dans <gameDir>/runtime/java21/ pour ne pas dépendre du Java système.
 */

function javaBin(jreDir) {
  return path.join(jreDir, 'bin', config.IS_WIN ? 'javaw.exe' : 'java');
}

function probeJava(p) {
  return new Promise((resolve) => {
    execFile(p, ['-version'], (err, _stdout, stderr) => {
      if (err) return resolve(null);
      // Le -version sort sur stderr — yes c'est moche, c'est Java
      const m = /version "(\d+)/.exec(stderr || '');
      resolve(m ? parseInt(m[1], 10) : null);
    });
  });
}

async function ensureJava21(gameDir, onProgress) {
  const jreDir = path.join(gameDir, 'runtime', 'java21');
  const bin = javaBin(jreDir);

  if (fs.existsSync(bin)) {
    const major = await probeJava(bin);
    if (major === config.JAVA_VERSION) return bin;
  }

  onProgress && onProgress({ step: 'downloading-java' });
  await fs.promises.mkdir(jreDir, { recursive: true });

  const tmpZip = path.join(gameDir, 'runtime', 'java21.zip');
  const res = await axios.get(config.JAVA_TEMURIN_WIN_X64, {
    responseType: 'stream',
    maxRedirects: 10,
    timeout: 120000,
  });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(tmpZip);
    res.data.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });

  onProgress && onProgress({ step: 'extracting-java' });
  await extract(tmpZip, { dir: path.dirname(jreDir) + path.sep + '_tmp' });

  // Temurin se zippe en jdk-21.0.X+Y-jre/ — on aplatit
  const tmpExtract = path.dirname(jreDir) + path.sep + '_tmp';
  const inner = fs.readdirSync(tmpExtract)[0];
  if (fs.existsSync(jreDir)) fs.rmSync(jreDir, { recursive: true, force: true });
  fs.renameSync(path.join(tmpExtract, inner), jreDir);
  fs.rmSync(tmpExtract, { recursive: true, force: true });
  fs.unlinkSync(tmpZip);

  const finalCheck = await probeJava(bin);
  if (finalCheck !== config.JAVA_VERSION) {
    throw new Error(`Java install failed — got version ${finalCheck}`);
  }
  return bin;
}

module.exports = { ensureJava21 };
