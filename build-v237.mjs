import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const esbuild = '/home/ubuntu/abyss-timer-react-vite-migration/node_modules/esbuild/bin/esbuild';
const read = (name) => readFileSync(join(root, name), 'utf8');

function buildJs(outputName, sources) {
  const source = sources.map(read).join('\n;\n');
  const output = execFileSync(esbuild, [
    '--minify-syntax',
    '--minify-whitespace',
    '--legal-comments=none',
    '--charset=utf8',
  ], { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
  writeFileSync(join(root, outputName), output);
}

function buildCss(outputName, source) {
  const output = execFileSync(esbuild, [
    '--minify',
    '--legal-comments=none',
    '--charset=utf8',
    '--loader=css',
  ], { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
  writeFileSync(join(root, outputName), output);
}

const cssLines = read('styles-v228.css').split('\n');
const primaryCss = [
  ...cssLines.slice(0, 471),
  ':root{--timer-pop-system-font:ui-rounded,"Arial Rounded MT Bold","Trebuchet MS",Roboto,system-ui,sans-serif;}',
  'input,textarea{caret-color:transparent!important;}',
].join('\n');
const gamesCss = [
  ...cssLines.slice(471),
  '#gamesAll{contain:layout paint style;}',
].join('\n');

buildJs('app-primary-v237.min.js', ['core-v228.js', 'abyss-v228.js', 'bootstrap-v228.js']);
buildJs('games-deferred-v237.min.js', ['generation-v228.js', 'starleap-v228.js']);
buildCss('styles-primary-v237.min.css', primaryCss);
buildCss('styles-games-v237.min.css', gamesCss);
