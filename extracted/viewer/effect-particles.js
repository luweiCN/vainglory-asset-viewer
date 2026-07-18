// 运行时粒子特效模块（独立于主 app 的面片渲染）。
// 目前只服务 Ringo 普攻三段（枪口 / 子弹 / 命中）；由主 app 的时序数据驱动，
// 主 app 仅在 entryUsesParticleEffect() 为真时才调用本模块，其它英雄/特效完全不受影响。
import * as THREE from "three";

// 贴图相对 viewer/index.html（file://）。都是"白色形状 + alpha"模板，颜色运行时上色。
const TEX_BASE = "../effect_textures_preview/Effects/Ringo/attack";
const texUrl = (bundle, surf) =>
  `${TEX_BASE}/${bundle}.assetbundle/${bundle}.Surface[${surf}].png`.replace(/\[/g, "%5B").replace(/\]/g, "%5D");

const TEX = {
  muzzleFire: texUrl("RingoAttackMF", 38),
  muzzleStar: texUrl("RingoAttackMF", 68),
  bulletGlow: texUrl("RingoAttackShot", 2),
  impactStar: texUrl("RingoAttackImpact", 40),
  impactRing: texUrl("RingoAttackImpact", 76),
};

const COLOR = {
  tracer: 0xff8a2c,
  tracerHot: 0xffd27a,
  muzzle: 0xffab48,
  spark: 0xffe0a0,
  impact: 0xff7a2c,
};

const _texLoader = new THREE.TextureLoader();
const _texCache = new Map();
function loadTex(url) {
  if (!_texCache.has(url)) {
    const t = _texLoader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    _texCache.set(url, t);
  }
  return _texCache.get(url);
}

// 是否走粒子系统：目前仅锁定 Ringo 普攻三段，最大化隔离。
export function entryUsesParticleEffect(pfxPath) {
  const hit = /RingoAttack(MF|Shot|Impact)\b/i.test(pfxPath || "");
  if (typeof window !== "undefined") {
    window.__pdbg = window.__pdbg || { checked: [], created: 0, updates: 0, lastCtx: null };
    if (pfxPath) window.__pdbg.checked.push((hit ? "HIT " : "miss ") + String(pfxPath).slice(0, 90));
  }
  return hit;
}

export function particleRoleForPfx(pfxPath) {
  if (/RingoAttackMF/i.test(pfxPath)) return "muzzle";
  if (/RingoAttackShot/i.test(pfxPath)) return "projectile";
  if (/RingoAttackImpact/i.test(pfxPath)) return "impact";
  return null;
}

// 一个粒子特效实例，对应主 app 的一个 entry（三段各一个）。
// 粒子挂到 fxRoot（主 app 传入的、位于模型局部空间的容器），拖尾/火星留在原地渐隐。
export class RuntimeParticleEffect {
  constructor(role, fxRoot) {
    this.role = role;
    this.fxRoot = fxRoot;
    this.particles = [];
    this._lastProgress = 1;
    this._lastOpacity = 0;
    this._firedImpact = false;
    this._firedMuzzle = false;
    if (typeof window !== "undefined" && window.__pdbg) window.__pdbg.created++;
  }

  // p: { tex, pos, color, size, aspect, life, grow, vel, spin, fadePow }
  _spawn(p) {
    const mat = new THREE.SpriteMaterial({
      map: loadTex(p.tex),
      color: new THREE.Color(p.color),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      rotation: p.rot || 0,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(p.pos);
    const aspect = p.aspect ?? 1;
    s.scale.set(p.size * aspect, p.size, 1);
    this.fxRoot.add(s);
    this.particles.push({
      s,
      age: 0,
      life: p.life,
      sx0: p.size * aspect,
      sy0: p.size,
      grow: p.grow ?? 1,
      vel: p.vel ? p.vel.clone() : null,
      spin: p.spin || 0,
      fadePow: p.fadePow ?? 1,
    });
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const r = this.particles[i];
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        this.fxRoot.remove(r.s);
        r.s.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      if (r.vel) r.s.position.addScaledVector(r.vel, dt);
      const g = 1 + (r.grow - 1) * k;
      r.s.scale.set(r.sx0 * g, r.sy0 * g, 1);
      r.s.material.rotation += r.spin * dt;
      r.s.material.opacity = Math.pow(1 - k, r.fadePow);
    }
  }

  _fireMuzzle(pos, u) {
    this._spawn({ tex: TEX.muzzleFire, pos, color: COLOR.muzzle, size: 0.3 * u, life: 0.08, grow: 1.5, fadePow: 1.3, rot: Math.random() * 6 });
    this._spawn({ tex: TEX.muzzleStar, pos, color: 0xffe0a0, size: 0.36 * u, life: 0.06, grow: 1.4, fadePow: 2, rot: Math.random() * 6 });
  }

  _fireBulletTrail(pos, u) {
    // 外层柔光 + 内亮芯，水平拉长成曳光拉丝
    this._spawn({ tex: TEX.bulletGlow, pos, color: COLOR.tracer, size: 0.11 * u, aspect: 6.5, life: 0.09, grow: 0.6, fadePow: 1.4 });
    this._spawn({ tex: TEX.bulletGlow, pos, color: COLOR.tracerHot, size: 0.055 * u, aspect: 8, life: 0.08, grow: 0.6, fadePow: 1.3 });
  }

  _fireImpact(pos, u) {
    this._spawn({ tex: TEX.impactRing, pos, color: COLOR.impact, size: 0.11 * u, life: 0.24, grow: 2.0, fadePow: 1.7 });
    this._spawn({ tex: TEX.impactStar, pos, color: 0xffc070, size: 0.26 * u, life: 0.15, grow: 1.7, fadePow: 1.8, rot: Math.random() * 6 });
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.2) * 1.6;
      const v = new THREE.Vector3(Math.cos(a), Math.abs(e) + 0.4, Math.sin(a)).multiplyScalar((1.2 + Math.random() * 1.4) * u);
      const white = i % 3 === 0;
      this._spawn({ tex: TEX.bulletGlow, pos, color: white ? 0xffffff : COLOR.spark, size: (white ? 0.05 : 0.08) * u, life: 0.18 + Math.random() * 0.12, grow: 0.5, fadePow: 1.5, vel: v });
    }
  }

  // ctx: { opacity, progress, origin:Vector3, direction:Vector3, distance:number, unit:number }
  update(dt, ctx) {
    if (typeof window !== "undefined" && window.__pdbg) {
      window.__pdbg.updates++;
      window.__pdbg.lastCtx = {
        role: this.role,
        opacity: ctx.opacity,
        progress: ctx.progress,
        origin: ctx.origin ? ctx.origin.toArray().map((n) => +n.toFixed(1)) : null,
        dir: ctx.direction ? ctx.direction.toArray().map((n) => +n.toFixed(2)) : null,
        dist: ctx.distance,
        unit: ctx.unit,
      };
    }
    const u = ctx.unit || 1;
    const origin = ctx.origin;
    const dir = ctx.direction;
    const dist = ctx.distance;
    const prog = Number.isFinite(ctx.progress) ? ctx.progress : 0;
    const op = Number.isFinite(ctx.opacity) ? ctx.opacity : 0;
    const restarted = prog < this._lastProgress - 0.3 || (prog <= 0.02 && this._lastProgress <= 0.02); // 动作循环回到起点 = 新一发

    if (origin && dir) {
      if (this.role === "muzzle") {
        if (op > 0.35 && this._lastOpacity <= 0.35) this._fireMuzzle(origin, u);
      } else if (this.role === "projectile") {
        // 基础普攻只有 Shot entry，由子弹粒子包办三段：起手枪口 → 飞行拖尾 → 命中
        if (restarted) {
          this._firedMuzzle = false;
          this._firedImpact = false;
        }
        if (prog > 0.001 && !this._firedMuzzle) {
          this._fireMuzzle(origin, u);
          this._firedMuzzle = true;
        }
        if (prog > 0.001 && prog < 0.999) {
          const pos = origin.clone().addScaledVector(dir, prog * dist);
          this._fireBulletTrail(pos, u);
        }
        if (prog >= 0.97 && !this._firedImpact) {
          this._fireImpact(origin.clone().addScaledVector(dir, dist), u);
          this._firedImpact = true;
        }
      } else if (this.role === "impact") {
        if (restarted) this._firedImpact = false;
        if (prog >= 0.97 && !this._firedImpact) {
          this._fireImpact(origin.clone().addScaledVector(dir, dist), u);
          this._firedImpact = true;
        }
      }
    }

    this._lastProgress = prog;
    this._lastOpacity = op;
    this._updateParticles(dt);
  }

  dispose() {
    for (const r of this.particles) {
      this.fxRoot.remove(r.s);
      r.s.material.dispose();
    }
    this.particles.length = 0;
  }
}
