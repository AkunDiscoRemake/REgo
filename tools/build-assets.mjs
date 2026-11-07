// REgo OS — pipeline de assets (rode: cd tools && npm i && node build-assets.mjs)
// Baixa modelos/texturas/céus CC0 do Poly Haven e mãos/controle MIT do WebXR Input Profiles,
// e otimiza tudo para o Oculus Go: simplifica malhas para um orçamento de triângulos,
// "assa" a oclusão ambiente (AO) na textura de cor, reduz texturas para 256–512 px e gera GLB.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = { models: path.join(ROOT, 'assets/models'), tex: path.join(ROOT, 'assets/tex'), sky: path.join(ROOT, 'assets/sky') };
Object.values(OUT).forEach(d => fs.mkdirSync(d, { recursive: true }));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rego-assets-'));
const only = process.argv[2] ? process.argv[2].split(',') : null;

// id do Poly Haven: [triângulos máx., tamanho da textura de cor]
export const MODELS = {
  // esportes / jogos
  baseball_bat: [1200, 256], baseball_01: [300, 256], football: [600, 256], american_football: [500, 256],
  dartboard: [1200, 512], cannon_01: [2500, 512], service_pistol: [1800, 512], wooden_axe: [700, 256],
  antique_katana_01: [1200, 256], machete: [600, 256], wooden_hammer_01: [600, 256], sledgehammer_01: [700, 256],
  metal_detector: [1500, 256], rusted_spade_01: [600, 256], rubber_duck_toy: [600, 256], garden_gnome: [1800, 512],
  // frutas
  food_apple_01: [350, 256], lemon: [300, 256], food_kiwi_01: [300, 256], food_pomegranate_01: [350, 256],
  food_avocado_01: [300, 256], food_lime_01: [300, 256],
  // física / sandbox
  Barrel_01: [1200, 512], wine_barrel_01: [1200, 512], wooden_crate_01: [500, 512], cardboard_box_01: [300, 512],
  old_tyre: [1200, 512], propane_tank: [1200, 512], metal_jerrycan: [1000, 512],
  treasure_chest: [2200, 512], concrete_road_barrier: [500, 512], Television_01: [1500, 512], ceramic_vase_01: [1000, 512],
  wine_bottles_01: [1500, 512], plastic_monobloc_chair_01: [1500, 512],
  // móveis / interiores
  Sofa_01: [2500, 512], ArmChair_01: [2000, 512], WoodenTable_01: [900, 512], wooden_bookshelf_worn: [2000, 512],
  vintage_grandfather_clock_01: [2500, 512], drawer_cabinet: [1500, 512],
  standing_chalkboard_01: [800, 512], wooden_lantern_01: [800, 256], vintage_flashlight: [800, 256],
  // museu
  marble_bust_01: [3000, 512], horse_statue_01: [3000, 512], gothic_statue: [3000, 512], bronze_shark_statue: [2500, 512],
  lion_head: [2500, 512], concrete_cat_statue: [2000, 512],
  // natureza / exterior (árvores grandes do Poly Haven têm folhas demais para o Go; usamos mudas e arbustos)
  shrub_01: [1500, 512], fir_sapling: [1500, 512], namaqualand_boulder_02: [800, 512],
  rock_07: [800, 512], moon_rock_01: [600, 512], street_lamp_01: [900, 256], fire_hydrant: [700, 256],
  wooden_picnic_table: [800, 512], lifebuoy: [500, 256], wooden_bucket_01: [500, 256],
  // === Ambiente 3D (móveis, decoração, plantas, luminárias — CC0 Poly Haven) ===
  CoffeeTable_01: [1500, 512], modern_coffee_table_01: [1500, 512], coffee_table_round_01: [1500, 512], round_wooden_table_01: [1200, 512],
  dining_table: [1500, 512], side_table_01: [1000, 512], GreenChair_01: [2000, 512], Ottoman_01: [1500, 512], Rockingchair_01: [2200, 512],
  modern_arm_chair_01: [2200, 512], mid_century_lounge_chair: [2200, 512], painted_wooden_chair_01: [1500, 512], dining_chair_02: [1800, 512],
  folding_wooden_stool: [1200, 512], sofa_02: [2500, 512], sofa_03: [2500, 512],
  potted_plant_01: [2200, 512], potted_plant_02: [2200, 512], potted_plant_04: [2200, 512], anthurium_botany_01: [2000, 512],
  calathea_orbifolia_01: [2200, 512], shrub_02: [1500, 512], shrub_03: [1500, 512], shrub_04: [1500, 512], rock_moss_set_01: [1200, 512],
  ceramic_vase_02: [900, 512], ceramic_vase_03: [900, 512], brass_vase_01: [900, 512], wooden_bowl_01: [700, 512],
  fancy_picture_frame_01: [600, 512], hanging_picture_frame_01: [500, 512],
  mantel_clock_01: [1200, 512], wall_clock: [900, 512], chess_set: [2500, 512], tea_set_01: [1800, 512],
  desk_lamp_arm_01: [1200, 256], modern_ceiling_lamp_01: [1200, 256], hanging_industrial_lamp: [1200, 256],
  wicker_basket_01: [1200, 512], wicker_basket_02: [1200, 512], boombox: [1200, 512],
  stone_fire_pit: [1500, 512], planter_box_01: [700, 512], outdoor_table_chair_set_01: [2500, 512]
};
// texturas de superfície (cor com AO 512 px + normal 256 px)
export const TEXTURES = ['sparse_grass', 'leafy_grass', 'wood_floor', 'asphalt_02', 'coast_sand_01', 'snow_02', 'brushed_concrete',
  'brown_planks_03', 'marble_tiles', 'laminate_floor', 'park_dirt', 'aerial_grass_rock', 'brick_floor'];
// céus (JPG já com tone mapping, 2048x1024)
export const SKIES = { day: 'kloofendal_48d_partly_cloudy_puresky', sunset: 'belfast_sunset_puresky', night: 'dikhololo_night',
  overcast: 'kloofendal_overcast_puresky', snow: 'snowy_park_01', beach: 'secluded_beach', stadium: 'orlando_stadium',
  billiard: 'billiard_hall', studio: 'art_studio', hall: 'entrance_hall', haunted: 'abandoned_hall_01',
  apartamento: 'cayley_interior', sala: 'kiara_interior', lounge: 'lythwood_lounge', lab: 'industrial_pipe_and_valve_01', hospital: 'hospital_room',
  cinema: 'cinema_hall', salacinza: 'interior_construction' };

function curl(url, dest) {
  for (let i = 0; i < 4; i++) {
    try { execFileSync('curl', ['-sSfL', '--retry', '2', '-o', dest, url], { stdio: 'pipe' }); return; }
    catch (e) { if (i === 3) throw e; }
  }
}
const json = url => { const f = path.join(TMP, 'j' + Math.random() + '.json'); curl(url, f); return JSON.parse(fs.readFileSync(f, 'utf8')); };

async function bakeColor(diffPath, aoPath, size, aoChannel) {
  let img = sharp(diffPath).resize(size, size, { fit: 'fill' });
  if (aoPath) {
    let ao = sharp(aoPath).resize(size, size, { fit: 'fill' });
    if (aoChannel !== undefined) ao = ao.extractChannel(aoChannel);
    const aoBuf = await ao.toColourspace('srgb').png().toBuffer();
    img = img.composite([{ input: aoBuf, blend: 'multiply' }]);
  }
  return img.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

const credits = fs.existsSync(path.join(ROOT, 'assets/CREDITS.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/CREDITS.json'), 'utf8')) : {};

async function buildModel(id, [maxTris, texSize]) {
  const dir = path.join(TMP, id); fs.mkdirSync(path.join(dir, 'textures'), { recursive: true });
  const files = json(`https://api.polyhaven.com/files/${id}`);
  const g = files.gltf['1k'].gltf;
  const gltfPath = path.join(dir, path.basename(g.url)); curl(g.url, gltfPath);
  for (const [rel, info] of Object.entries(g.include)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); curl(info.url, path.join(dir, rel)); }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const count = d => { let t = 0; for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const ix = p.getIndices(); t += (ix ? ix.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return t; };
  let doc = await io.read(gltfPath);
  const tris = count(doc);
  const ratio = Math.min(1, maxTris / Math.max(1, tris));
  // aumenta o erro permitido até caber no orçamento (folhagens/peças soltas resistem à simplificação)
  for (const err of [0.008, 0.03, 0.08, 0.2, 0.5]) {
    if (err !== 0.008) doc = await io.read(gltfPath);
    await doc.transform(weld({ tolerance: err > 0.05 ? 0.001 : 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio, error: err, lockBorder: false }));
    if (count(doc) <= maxTris * 1.35) break;
  }
  // texturas: cor * AO (canal R do ARM) -> JPG pequeno; normal 256; remove o resto
  for (const mat of doc.getRoot().listMaterials()) {
    const base = mat.getBaseColorTexture(), arm = mat.getOcclusionTexture() || mat.getMetallicRoughnessTexture(), nor = mat.getNormalTexture();
    if (base) {
      const bp = path.join(TMP, id + '_b'), ap = path.join(TMP, id + '_a');
      fs.writeFileSync(bp, base.getImage()); if (arm) fs.writeFileSync(ap, arm.getImage());
      base.setImage(await bakeColor(bp, arm ? ap : null, texSize, 0)).setMimeType('image/jpeg').setURI(id + '_c.jpg');
    }
    if (nor) {
      const np = path.join(TMP, id + '_n'); fs.writeFileSync(np, nor.getImage());
      nor.setImage(await sharp(np).resize(Math.min(256, texSize), Math.min(256, texSize)).jpeg({ quality: 82 }).toBuffer()).setMimeType('image/jpeg').setURI(id + '_n.jpg');
    }
    mat.setOcclusionTexture(null); mat.setMetallicRoughnessTexture(null); mat.setEmissiveTexture(null);
    mat.setRoughnessFactor(0.75);
  }
  await doc.transform(prune(), dedup(), quantize());
  let after = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const ix = p.getIndices(); after += (ix ? ix.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  const out = path.join(OUT.models, id + '.glb');
  await io.write(out, doc);
  credits['models/' + id + '.glb'] = { source: `https://polyhaven.com/a/${id}`, license: 'CC0 1.0', author: 'Poly Haven', tris: Math.round(after) };
  console.log(`modelo ${id}: ${Math.round(tris)} -> ${Math.round(after)} tri, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

async function buildTexture(id) {
  const files = json(`https://api.polyhaven.com/files/${id}`);
  const d = path.join(TMP, id + '_d.jpg'), ao = path.join(TMP, id + '_ao.jpg'), n = path.join(TMP, id + '_nn.jpg');
  curl(files.Diffuse['1k'].jpg.url, d);
  const hasAO = files.AO && files.AO['1k']; if (hasAO) curl(files.AO['1k'].jpg.url, ao);
  fs.writeFileSync(path.join(OUT.tex, id + '.jpg'), await bakeColor(d, hasAO ? ao : null, 512));
  const nk = files.nor_gl ? 'nor_gl' : null;
  if (nk) { curl(files[nk]['1k'].jpg.url, n); fs.writeFileSync(path.join(OUT.tex, id + '_n.jpg'), await sharp(n).resize(256, 256).jpeg({ quality: 82 }).toBuffer()); }
  credits['tex/' + id + '.jpg'] = { source: `https://polyhaven.com/a/${id}`, license: 'CC0 1.0', author: 'Poly Haven' };
  console.log('textura', id);
}

async function buildSky(key, id) {
  const src = path.join(TMP, id + '.jpg');
  curl(`https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/${id}.jpg`, src);
  fs.writeFileSync(path.join(OUT.sky, key + '.jpg'), await sharp(src).resize(2048, 1024).jpeg({ quality: 78, mozjpeg: true }).toBuffer());
  credits['sky/' + key + '.jpg'] = { source: `https://polyhaven.com/a/${id}`, license: 'CC0 1.0', author: 'Poly Haven' };
  console.log('céu', key, '=', id);
}

function buildXR() {
  const base = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/';
  [['generic-hand/left.glb', 'hand_left.glb'], ['generic-hand/right.glb', 'hand_right.glb'], ['oculus-go/none.glb', 'oculus_go.glb']].forEach(([s, d]) => {
    curl(base + s, path.join(OUT.models, d));
    credits['models/' + d] = { source: 'https://github.com/immersive-web/webxr-input-profiles (packages/assets)', license: 'MIT', author: 'W3C Immersive Web WG' };
  });
  console.log('mãos + controle (MIT)');
}

async function pool(items, n, fn) {
  const q = items.slice(); const errs = [];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const it = q.shift(); try { await fn(it); } catch (e) { errs.push(it + ': ' + e.message); console.log('FALHOU', it, e.message); } } }));
  return errs;
}

const want = k => !only || only.includes(k);
if (want('xr')) buildXR();
const errs = [];
errs.push(...await pool(Object.keys(SKIES).filter(k => want('sky') || want(k)), 4, k => buildSky(k, SKIES[k])));
errs.push(...await pool(TEXTURES.filter(t => want('tex') || want(t)), 4, buildTexture));
errs.push(...await pool(Object.keys(MODELS).filter(m => want('models') || want(m)), 4, m => buildModel(m, MODELS[m])));
fs.writeFileSync(path.join(ROOT, 'assets/CREDITS.json'), JSON.stringify(credits, null, 1));
fs.rmSync(TMP, { recursive: true, force: true });
console.log(errs.length ? 'Erros:\n' + errs.join('\n') : 'OK');
