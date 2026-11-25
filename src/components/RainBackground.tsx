import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ThemeMode } from '../types';

interface RainBackgroundProps {
  theme: ThemeMode;
}

interface LedgeRect {
  left: number;
  right: number;
  top: number;
}

/**
 * Three.js 3D depth rain + out-of-focus bokeh + column-top rain splash ambience layer.
 * Splashes land directly along the top borders of visible `[data-rain-ledge]` column headers.
 */
export const RainBackground: React.FC<RainBackgroundProps> = ({ theme }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const themeRef = useRef<ThemeMode>(theme);
  themeRef.current = theme;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: 'low-power',
      });
    } catch {
      return;
    }

    let viewWidth = window.innerWidth;
    let viewHeight = window.innerHeight;
    const isMobile = viewWidth < 1024;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(viewWidth, viewHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fovDeg = 55;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
    const camera = new THREE.PerspectiveCamera(fovDeg, viewWidth / viewHeight, 0.5, 60);
    camera.position.set(0, 0, 14);

    // Collect visible top edges of the 3 columns (`[data-rain-ledge]`)
    let cachedLedges: LedgeRect[] = [];
    const refreshLedges = () => {
      const nodes = document.querySelectorAll<HTMLElement>('[data-rain-ledge]');
      const next: LedgeRect[] = [];
      nodes.forEach((el) => {
        const r = el.getBoundingClientRect();
        // Only splash on ledges that are visible and have enough room above for upward splash arcs
        if (r.width > 40 && r.height > 10 && r.top >= 10 && r.top <= viewHeight * 0.75) {
          next.push({ left: r.left + 8, right: r.right - 8, top: r.top });
        }
      });
      cachedLedges = next;
    };
    refreshLedges();

    // Map screen pixel coordinates (px, py) to world space at depth z
    const screenToWorldAtZ = (px: number, py: number, z: number) => {
      const dist = Math.max(1, camera.position.z - z);
      const halfH = dist * tanHalfFov;
      const halfW = halfH * camera.aspect;
      const ndcX = (px / viewWidth) * 2 - 1;
      const ndcY = -(py / viewHeight) * 2 + 1;
      return {
        x: camera.position.x + ndcX * halfW,
        y: camera.position.y + ndcY * halfH,
      };
    };

    // --- Layer 1: 3D Depth Rain Streaks (LineSegments) ---
    const dropCount = isMobile ? 320 : 680;
    const boundsX = 24;
    const boundsY = 16;
    const minZ = -18;
    const maxZ = 5;

    const rainPositions = new Float32Array(dropCount * 2 * 3);
    const rainSpeeds = new Float32Array(dropCount);
    const rainLengths = new Float32Array(dropCount);

    for (let i = 0; i < dropCount; i++) {
      const x = (Math.random() - 0.5) * boundsX * 2;
      const y = (Math.random() - 0.5) * boundsY * 2;
      const z = minZ + Math.random() * (maxZ - minZ);
      const depthFactor = (z - minZ) / (maxZ - minZ);
      const speed = 13 + depthFactor * 14 + Math.random() * 4;
      const length = 0.35 + depthFactor * 0.55;

      rainSpeeds[i] = speed;
      rainLengths[i] = length;

      const idx = i * 6;
      rainPositions[idx] = x;
      rainPositions[idx + 1] = y;
      rainPositions[idx + 2] = z;
      rainPositions[idx + 3] = x - length * 0.14;
      rainPositions[idx + 4] = y + length;
      rainPositions[idx + 5] = z;
    }

    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));

    const rainMaterial = new THREE.LineBasicMaterial({
      color: themeRef.current === 'dark' ? 0x93c5fd : 0x4f46e5,
      transparent: true,
      opacity: themeRef.current === 'dark' ? 0.26 : 0.18,
      depthWrite: false,
    });

    const rainLines = new THREE.LineSegments(rainGeometry, rainMaterial);
    scene.add(rainLines);

    // --- Layer 2: Soft Out-of-Focus Bokeh Light Orbs (ShaderMaterial Points) ---
    const bokehCount = isMobile ? 24 : 46;
    const bokehPositions = new Float32Array(bokehCount * 3);
    const bokehSizes = new Float32Array(bokehCount);
    const bokehPhases = new Float32Array(bokehCount);
    const bokehDrifts = new Float32Array(bokehCount * 2);

    for (let i = 0; i < bokehCount; i++) {
      bokehPositions[i * 3] = (Math.random() - 0.5) * 26;
      bokehPositions[i * 3 + 1] = (Math.random() - 0.5) * 18;
      bokehPositions[i * 3 + 2] = -14 + Math.random() * 12;
      bokehSizes[i] = 28 + Math.random() * 68;
      bokehPhases[i] = Math.random() * Math.PI * 2;
      bokehDrifts[i * 2] = (Math.random() - 0.5) * 0.22;
      bokehDrifts[i * 2 + 1] = -0.25 - Math.random() * 0.35;
    }

    const bokehGeometry = new THREE.BufferGeometry();
    bokehGeometry.setAttribute('position', new THREE.BufferAttribute(bokehPositions, 3));
    bokehGeometry.setAttribute('aSize', new THREE.BufferAttribute(bokehSizes, 1));
    bokehGeometry.setAttribute('aPhase', new THREE.BufferAttribute(bokehPhases, 1));

    const bokehMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColorA: {
          value: new THREE.Color(themeRef.current === 'dark' ? 0x38bdf8 : 0x6366f1),
        },
        uColorB: {
          value: new THREE.Color(themeRef.current === 'dark' ? 0x818cf8 : 0x0ea5e9),
        },
        uOpacity: { value: themeRef.current === 'dark' ? 0.22 : 0.14 },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vMix;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float pulse = 0.65 + 0.35 * sin(uTime * 0.9 + aPhase);
          vAlpha = pulse;
          vMix = fract(aPhase * 0.618);
          gl_PointSize = aSize * uPixelRatio * (12.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uOpacity;
        varying float vAlpha;
        varying float vMix;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float core = smoothstep(0.5, 0.08, dist);
          float rim = smoothstep(0.5, 0.36, dist) * 0.25;
          vec3 col = mix(uColorA, uColorB, vMix);
          gl_FragColor = vec4(col, (core * 0.75 + rim) * vAlpha * uOpacity);
        }
      `,
    });

    const bokehPoints = new THREE.Points(bokehGeometry, bokehMaterial);
    scene.add(bokehPoints);

    // --- Layer 3: Column-Top Rain Splashes (Parabolic Droplets + Impact Rings) ---
    const splashMaxDrops = isMobile ? 96 : 210;
    const splashPositions = new Float32Array(splashMaxDrops * 3);
    const splashVelX = new Float32Array(splashMaxDrops);
    const splashVelY = new Float32Array(splashMaxDrops);
    const splashAge = new Float32Array(splashMaxDrops);
    const splashLife = new Float32Array(splashMaxDrops);
    const splashAlpha = new Float32Array(splashMaxDrops);
    const splashSizes = new Float32Array(splashMaxDrops);

    for (let i = 0; i < splashMaxDrops; i++) {
      splashAge[i] = 99;
      splashLife[i] = 1;
      splashAlpha[i] = 0;
      splashSizes[i] = 9;
    }

    const splashGeometry = new THREE.BufferGeometry();
    splashGeometry.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
    splashGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(splashAlpha, 1));
    splashGeometry.setAttribute('aSize', new THREE.BufferAttribute(splashSizes, 1));

    const splashMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: {
          value: new THREE.Color(themeRef.current === 'dark' ? 0xe0f2fe : 0x3b82f6),
        },
        uOpacity: { value: themeRef.current === 'dark' ? 0.85 : 0.62 },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (12.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.01) discard;
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.08, d) * vAlpha * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    const splashPoints = new THREE.Points(splashGeometry, splashMaterial);
    scene.add(splashPoints);

    // Expanding elliptical impact ripples right along the top edges of the 3 columns
    const ringCount = isMobile ? 16 : 32;
    const ringPositions = new Float32Array(ringCount * 3);
    const ringAge = new Float32Array(ringCount);
    const ringLife = new Float32Array(ringCount);
    const ringProgress = new Float32Array(ringCount);
    const ringMaxSize = new Float32Array(ringCount);

    for (let i = 0; i < ringCount; i++) {
      ringAge[i] = 99;
      ringLife[i] = 0.45;
      ringProgress[i] = 1;
      ringMaxSize[i] = 32;
    }

    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3));
    ringGeometry.setAttribute('aProgress', new THREE.BufferAttribute(ringProgress, 1));
    ringGeometry.setAttribute('aMaxSize', new THREE.BufferAttribute(ringMaxSize, 1));

    const ringMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: {
          value: new THREE.Color(themeRef.current === 'dark' ? 0xbae6fd : 0x4f46e5),
        },
        uOpacity: { value: themeRef.current === 'dark' ? 0.56 : 0.4 },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: `
        attribute float aProgress;
        attribute float aMaxSize;
        uniform float uPixelRatio;
        varying float vProgress;
        void main() {
          vProgress = aProgress;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float scale = 0.25 + aProgress * 0.75;
          gl_PointSize = aMaxSize * scale * uPixelRatio * (12.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vProgress;
        void main() {
          if (vProgress >= 0.99) discard;
          vec2 uv = (gl_PointCoord - vec2(0.5)) * vec2(1.0, 2.3);
          float d = length(uv);
          float ringRadius = 0.36;
          float ringBand = smoothstep(0.11, 0.0, abs(d - ringRadius));
          float fade = (1.0 - vProgress) * (1.0 - vProgress);
          float alpha = ringBand * fade * uOpacity;
          if (alpha <= 0.01) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    const ringPoints = new THREE.Points(ringGeometry, ringMaterial);
    scene.add(ringPoints);

    let nextDropCursor = 0;
    let nextRingCursor = 0;
    let splashTimer = 0;

    const spawnColumnLedgeSplash = () => {
      if (cachedLedges.length === 0) return;

      // Weighted by column width so the wider center column gets proportionally more hits
      let totalWidth = 0;
      for (const l of cachedLedges) {
        totalWidth += Math.max(1, l.right - l.left);
      }
      let pick = Math.random() * totalWidth;
      let chosen = cachedLedges[0];
      for (const l of cachedLedges) {
        const w = Math.max(1, l.right - l.left);
        if (pick <= w) {
          chosen = l;
          break;
        }
        pick -= w;
      }

      const screenX = chosen.left + Math.random() * Math.max(1, chosen.right - chosen.left);
      const screenY = chosen.top;
      const z = 1.5; // Consistent foreground plane so coordinates stay aligned with card tops
      const world = screenToWorldAtZ(screenX, screenY, z);

      // Expanding splash ring right on the card top border
      const rIdx = nextRingCursor;
      nextRingCursor = (nextRingCursor + 1) % ringCount;
      ringPositions[rIdx * 3] = world.x;
      ringPositions[rIdx * 3 + 1] = world.y;
      ringPositions[rIdx * 3 + 2] = z;
      ringAge[rIdx] = 0;
      ringLife[rIdx] = 0.35 + Math.random() * 0.2;
      ringProgress[rIdx] = 0;
      ringMaxSize[rIdx] = 24 + Math.random() * 20;

      // 5-7 water droplets leaping upward above the card edge and curving back down
      const burstCount = 5 + Math.floor(Math.random() * 3);
      for (let k = 0; k < burstCount; k++) {
        const dIdx = nextDropCursor;
        nextDropCursor = (nextDropCursor + 1) % splashMaxDrops;

        const angle = Math.PI * (0.18 + Math.random() * 0.64); // upward fan
        const speed = 1.35 + Math.random() * 2.1;
        splashPositions[dIdx * 3] = world.x + (Math.random() - 0.5) * 0.08;
        splashPositions[dIdx * 3 + 1] = world.y + 0.02;
        splashPositions[dIdx * 3 + 2] = z;
        splashVelX[dIdx] = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1) + 0.25;
        splashVelY[dIdx] = Math.sin(angle) * speed * 0.72;
        splashAge[dIdx] = 0;
        splashLife[dIdx] = 0.34 + Math.random() * 0.24;
        splashAlpha[dIdx] = 1;
        splashSizes[dIdx] = 5.0 + Math.random() * 4.5;
      }
    };

    for (let s = 0; s < (isMobile ? 3 : 6); s++) {
      spawnColumnLedgeSplash();
    }

    // Subtle pointer parallax (desktop only)
    let targetMouseX = 0;
    let targetMouseY = 0;
    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 0.65;
      targetMouseY = -(e.clientY / window.innerHeight - 0.5) * 0.4;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const handleScroll = () => {
      refreshLedges();
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Watch DOM changes (route / tab switches) to re-measure the 3 column top edges
    const observer = new MutationObserver(() => {
      refreshLedges();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const handleResize = () => {
      if (!renderer) return;
      viewWidth = window.innerWidth;
      viewHeight = window.innerHeight;
      const pr = Math.min(window.devicePixelRatio || 1, 1.5);
      camera.aspect = viewWidth / viewHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pr);
      renderer.setSize(viewWidth, viewHeight);
      bokehMaterial.uniforms.uPixelRatio.value = pr;
      splashMaterial.uniforms.uPixelRatio.value = pr;
      ringMaterial.uniforms.uPixelRatio.value = pr;
      refreshLedges();
    };
    window.addEventListener('resize', handleResize);

    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let activeTheme: ThemeMode = themeRef.current;

    const syncThemeColors = (mode: ThemeMode) => {
      if (mode === 'dark') {
        rainMaterial.color.setHex(0x93c5fd);
        rainMaterial.opacity = 0.26;
        bokehMaterial.uniforms.uColorA.value.setHex(0x38bdf8);
        bokehMaterial.uniforms.uColorB.value.setHex(0x818cf8);
        bokehMaterial.uniforms.uOpacity.value = 0.22;
        splashMaterial.uniforms.uColor.value.setHex(0xe0f2fe);
        splashMaterial.uniforms.uOpacity.value = 0.85;
        ringMaterial.uniforms.uColor.value.setHex(0xbae6fd);
        ringMaterial.uniforms.uOpacity.value = 0.56;
      } else {
        rainMaterial.color.setHex(0x4f46e5);
        rainMaterial.opacity = 0.18;
        bokehMaterial.uniforms.uColorA.value.setHex(0x6366f1);
        bokehMaterial.uniforms.uColorB.value.setHex(0x0ea5e9);
        bokehMaterial.uniforms.uOpacity.value = 0.14;
        splashMaterial.uniforms.uColor.value.setHex(0x3b82f6);
        splashMaterial.uniforms.uOpacity.value = 0.62;
        ringMaterial.uniforms.uColor.value.setHex(0x4f46e5);
        ringMaterial.uniforms.uOpacity.value = 0.4;
      }
    };

    const tick = (now: number) => {
      if (document.hidden) {
        rafId = 0;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      if (themeRef.current !== activeTheme) {
        activeTheme = themeRef.current;
        syncThemeColors(activeTheme);
      }

      // Smooth camera parallax
      camera.position.x += (targetMouseX - camera.position.x) * 0.04;
      camera.position.y += (targetMouseY - camera.position.y) * 0.04;
      camera.lookAt(0, 0, -4);

      // Animate Layer 1: Rain drops
      const posAttr = rainGeometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < dropCount; i++) {
        const idx = i * 6;
        const speed = rainSpeeds[i];
        const len = rainLengths[i];
        const dx = speed * 0.14 * dt;
        const dy = speed * dt;

        arr[idx] += dx;
        arr[idx + 1] -= dy;
        arr[idx + 3] += dx;
        arr[idx + 4] -= dy;

        if (arr[idx + 1] < -boundsY) {
          const resetX = (Math.random() - 0.5) * boundsX * 2;
          const resetY = boundsY + Math.random() * 4;
          arr[idx] = resetX;
          arr[idx + 1] = resetY;
          arr[idx + 3] = resetX - len * 0.14;
          arr[idx + 4] = resetY + len;
        }
      }
      posAttr.needsUpdate = true;

      // Animate Layer 2: Bokeh drift
      const bokehAttr = bokehGeometry.getAttribute('position') as THREE.BufferAttribute;
      const bArr = bokehAttr.array as Float32Array;
      for (let i = 0; i < bokehCount; i++) {
        bArr[i * 3] += bokehDrifts[i * 2] * dt;
        bArr[i * 3 + 1] += bokehDrifts[i * 2 + 1] * dt;
        if (bArr[i * 3 + 1] < -11) {
          bArr[i * 3 + 1] = 11;
          bArr[i * 3] = (Math.random() - 0.5) * 26;
        }
      }
      bokehAttr.needsUpdate = true;
      bokehMaterial.uniforms.uTime.value = elapsed;

      // Animate Layer 3: Column-top rain splashes & rings
      const spawnInterval = isMobile ? 0.14 : 0.06;
      splashTimer += dt;
      while (splashTimer >= spawnInterval) {
        splashTimer -= spawnInterval;
        spawnColumnLedgeSplash();
      }

      const gravity = 10.5;
      const sPosAttr = splashGeometry.getAttribute('position') as THREE.BufferAttribute;
      const sAlphaAttr = splashGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      for (let i = 0; i < splashMaxDrops; i++) {
        if (splashAge[i] >= splashLife[i]) {
          splashAlpha[i] = 0;
          continue;
        }
        splashAge[i] += dt;
        const progress = splashAge[i] / splashLife[i];
        if (progress >= 1) {
          splashAlpha[i] = 0;
          continue;
        }
        splashVelY[i] -= gravity * dt;
        splashPositions[i * 3] += splashVelX[i] * dt;
        splashPositions[i * 3 + 1] += splashVelY[i] * dt;
        splashAlpha[i] = (1 - progress) * (1 - progress);
      }
      sPosAttr.needsUpdate = true;
      sAlphaAttr.needsUpdate = true;

      const rPosAttr = ringGeometry.getAttribute('position') as THREE.BufferAttribute;
      const rProgAttr = ringGeometry.getAttribute('aProgress') as THREE.BufferAttribute;
      const rMaxAttr = ringGeometry.getAttribute('aMaxSize') as THREE.BufferAttribute;
      for (let i = 0; i < ringCount; i++) {
        if (ringAge[i] >= ringLife[i]) {
          ringProgress[i] = 1;
          continue;
        }
        ringAge[i] += dt;
        ringProgress[i] = Math.min(1, ringAge[i] / ringLife[i]);
      }
      rPosAttr.needsUpdate = true;
      rProgAttr.needsUpdate = true;
      rMaxAttr.needsUpdate = true;

      renderer?.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && !rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      rainGeometry.dispose();
      rainMaterial.dispose();
      bokehGeometry.dispose();
      bokehMaterial.dispose();
      splashGeometry.dispose();
      splashMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 -z-[5] pointer-events-none overflow-hidden"
    />
  );
};

export default RainBackground;
