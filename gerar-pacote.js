/* ============================================================
   Gera dist/sistema-jaques-motorsport.zip — o pacote que o
   ATUALIZAR.bat baixa do GitHub e instala no Windows.

   RODE ISTO SEMPRE que mudar qualquer arquivo do programa.
   Sem isso, o ATUALIZAR.bat continua entregando a versão antiga.

       node gerar-pacote.js

   O que entra no pacote: tudo que está versionado no git (menos a
   própria pasta dist) mais o node.exe. O node.exe não é versionado
   por causa do tamanho (87 MB) — se ele não estiver na raiz, o
   script o reaproveita do pacote anterior.

   A pasta "data" (dados reais da empresa) nunca entra aqui: ela é
   ignorada pelo git e o ATUALIZAR.bat também a preserva no destino.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const RAIZ = __dirname;
const PASTA = 'jaques-sistema';                       // pasta de dentro do zip
const SAIDA = path.join(RAIZ, 'dist', 'sistema-jaques-motorsport.zip');

/* ---------------- escritor de ZIP (só com o zlib do Node) ---------------- */

/* Data/hora no formato MS-DOS que o ZIP usa. */
function dosDataHora(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, data };
}

function criarZip(entradas, destino) {
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  const { hora, data } = dosDataHora(new Date(2026, 0, 1, 12, 0, 0)); // fixa: zip reprodutível

  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const pasta = e.dados === null;
    const bruto = pasta ? Buffer.alloc(0) : e.dados;
    const comprimido = pasta ? Buffer.alloc(0) : zlib.deflateRawSync(bruto, { level: 9 });
    const metodo = pasta ? 0 : 8;
    const crc = pasta ? 0 : zlib.crc32(bruto);

    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0);
    cab.writeUInt16LE(20, 4);          // versão necessária
    cab.writeUInt16LE(0x0800, 6);      // nomes em UTF-8
    cab.writeUInt16LE(metodo, 8);
    cab.writeUInt16LE(hora, 10);
    cab.writeUInt16LE(data, 12);
    cab.writeUInt32LE(crc, 14);
    cab.writeUInt32LE(comprimido.length, 18);
    cab.writeUInt32LE(bruto.length, 22);
    cab.writeUInt16LE(nome.length, 26);
    cab.writeUInt16LE(0, 28);
    locais.push(cab, nome, comprimido);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);          // versão de quem criou
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(metodo, 10);
    cen.writeUInt16LE(hora, 12);
    cen.writeUInt16LE(data, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comprimido.length, 20);
    cen.writeUInt32LE(bruto.length, 24);
    cen.writeUInt16LE(nome.length, 28);
    cen.writeUInt32LE(pasta ? 0x10 : 0, 38);   // atributo "diretório"
    cen.writeUInt32LE(deslocamento, 42);
    centrais.push(cen, nome);

    deslocamento += 30 + nome.length + comprimido.length;
  }

  const central = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(central.length, 12);
  fim.writeUInt32LE(deslocamento, 16);

  fs.writeFileSync(destino, Buffer.concat([...locais, central, fim]));
}

/* ---------------- montagem da lista ---------------- */

/* Fora do pacote do Windows: a pasta dist (é o próprio pacote), os arquivos de
   bastidor do git, o gerador e a receita de nuvem — que só a hospedagem usa. */
const FORA = new Set(['.gitignore', '.gitattributes', 'gerar-pacote.js',
                      'Dockerfile', '.dockerignore']);

const versionados = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
  .split('\n').map(s => s.trim())
  .filter(s => s && !s.startsWith('dist/') && !FORA.has(s));

/* node.exe: da raiz, ou reaproveitado do pacote anterior */
function acharNodeExe() {
  const local = path.join(RAIZ, 'node.exe');
  if (fs.existsSync(local)) return fs.readFileSync(local);
  throw new Error(
    'node.exe não encontrado na raiz do projeto.\n' +
    'Ele não é versionado (87 MB). Copie o node.exe do pacote anterior\n' +
    'para a raiz antes de gerar um novo pacote.');
}

const arquivos = versionados.map(rel => ({
  nome: `${PASTA}/${rel}`,
  dados: fs.readFileSync(path.join(RAIZ, rel))
}));
arquivos.push({ nome: `${PASTA}/node.exe`, dados: acharNodeExe() });

/* entradas de pasta, para o Expand-Archive do Windows não reclamar */
const pastas = new Set([`${PASTA}/`]);
for (const a of arquivos) {
  const partes = a.nome.split('/');
  for (let i = 1; i < partes.length; i++) pastas.add(partes.slice(0, i).join('/') + '/');
}

const entradas = [
  ...[...pastas].sort().map(p => ({ nome: p, dados: null })),
  ...arquivos
];

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
criarZip(entradas, SAIDA);

const mb = (fs.statSync(SAIDA).size / 1048576).toFixed(1);
console.log(`Pacote gerado: ${path.relative(RAIZ, SAIDA)}`);
console.log(`${arquivos.length} arquivos · ${mb} MB`);
console.log('\nAgora faça commit e push do dist/ para o ATUALIZAR.bat enxergar a versão nova.');
