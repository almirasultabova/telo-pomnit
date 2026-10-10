import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One public manifest is shared by local builds and the Vercel reserve.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Vercel's app project uses app/ as its root while shared media stays at repository root.
const output = process.argv.includes('--vercel-app')
  ? path.join(repository, 'app', '.vercel-build')
  : path.join(repository, 'output');
const mediaExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.ico', '.mp3', '.mp4', '.webm', '.woff', '.woff2']);
const pages = ['landing_final.html', 'thanks.html', 'offer.html', 'privacy.html', 'gaid-body-stress.html', 'admin.html', 'presentation.html'];

function assertInside(parent, target) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside ${parent}: ${target}`);
  }
}

function assertRegularFile(source) {
  const info = fs.lstatSync(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular source file: ${source}`);
}

function walk(directory) {
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Expected a regular directory: ${directory}`);
  const files = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in a public build: ${file}`);
    if (item.isDirectory()) files.push(...walk(file));
    else if (item.isFile()) files.push(file);
    else throw new Error(`Unsupported filesystem entry: ${file}`);
  }
  return files;
}

function addTree(manifest, sourceRelative, destination, extensions) {
  const source = path.join(repository, sourceRelative);
  for (const file of walk(source)) {
    if (extensions.has(path.extname(file).toLowerCase())) {
      manifest.push({ source: file, relative: path.join(destination, path.relative(source, file)) });
    }
  }
}

function prepare(name, manifest) {
  const directory = path.resolve(output, name);
  assertInside(output, directory);
  const expected = new Map();
  for (const entry of manifest) {
    assertRegularFile(entry.source);
    const target = path.resolve(directory, entry.relative);
    assertInside(directory, target);
    if (expected.has(target)) throw new Error(`Duplicate public destination: ${target}`);
    expected.set(target, entry.source);
  }
  if (fs.existsSync(output) && (!fs.lstatSync(output).isDirectory() || fs.lstatSync(output).isSymbolicLink())) {
    throw new Error(`Output must be a regular directory: ${output}`);
  }
  if (fs.existsSync(directory)) {
    for (const existing of walk(directory)) {
      if (!expected.has(existing)) {
        throw new Error(`Unexpected or stale build file: ${existing}. Move it out and run again; no files are deleted automatically.`);
      }
    }
  }
  return { name, directory, expected };
}

function bundleAppPage(directory) {
  const target = path.join(directory, 'index.html');
  let html = fs.readFileSync(target, 'utf8');
  html = html.replace(/<script src="(js\/[^"?]+)(?:\?[^" ]*)?"><\/script>/g, (_, relative) => {
    const code = fs.readFileSync(path.join(directory, relative), 'utf8').replace(/<\/script/gi, '<\\/script');
    return `<script>\n${code}\n</script>`;
  });
  html = html.replace(/<link rel="stylesheet" href="(css\/[^"?]+)(?:\?[^" ]*)?">/g, (_, relative) => {
    const css = fs.readFileSync(path.join(directory, relative), 'utf8');
    return `<style>\n${css}\n</style>`;
  });
  fs.writeFileSync(target, html);
}

try {
  const site = pages.map(name => ({ source: path.join(repository, 'site', name), relative: name }));
  addTree(site, 'media/site', 'media/site', mediaExtensions);
  addTree(site, 'media/shared', 'media/shared', mediaExtensions);
  const app = [
    { source: path.join(repository, 'app/index.html'), relative: 'index.html' },
    { source: path.join(repository, 'site/admin.html'), relative: 'admin.html' },
  ];
  addTree(app, 'app/css', 'css', new Set(['.css']));
  addTree(app, 'app/js', 'js', new Set(['.js']));
  addTree(app, 'media/app', 'media/app', mediaExtensions);
  // Only these two public font licenses; other text metadata stays private.
  for (const name of ['cormorant-garamond-OFL.txt', 'manrope-OFL.txt']) {
    app.push({ source: path.join(repository, 'media/app/fonts', name), relative: path.join('media/app/fonts', name) });
  }
  addTree(app, 'media/shared', 'media/shared', mediaExtensions);

  // Validate both manifests before copying any file.
  const builds = [prepare('site', site), prepare('app', app)];
  for (const build of builds) {
    for (const [target, source] of build.expected) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    if (build.name === 'app') bundleAppPage(build.directory);
    console.log(`${build.name}: ${build.expected.size} public files -> ${build.directory}`);
  }
  if (!fs.existsSync(path.join(repository, 'app/js/telegram-web-app.js'))) {
    console.warn('WARNING: app/js/telegram-web-app.js is missing. Restore the deployed SDK before a clean app deployment.');
  }
  console.log('Built public files only. Knowledge base, media/library, PDFs, .env and internal documents are excluded. Nothing was deployed.');
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
