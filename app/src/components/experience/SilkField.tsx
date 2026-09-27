import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GLView, ExpoWebGLRenderingContext } from "expo-gl";
import { SILK_FRAGMENT } from "./silkShader";
import { useSceneMotion } from "../../hooks/useSceneMotion";
/** React Bits Silk: original pattern/noise/UV math, native GL instead of three.js. */
export function SilkField({
  busy = false,
  context = "hadith",
}: {
  busy?: boolean;
  context?: string;
}) {
  const motion = useSceneMotion(),
    [ready, setReady] = useState(false);
  const draw = useRef<((time: number) => void) | null>(null),
    dispose = useRef<(() => void) | null>(null),
    elapsed = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      draw.current = null;
      dispose.current?.();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let raf = 0,
      last = performance.now();
    const start = last;
    const frameInterval = busy ? 48 : 32;
    const frame = (now: number) => {
      if (now - last >= frameInterval) {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        if (motion) elapsed.current += 0.1 * dt;
        draw.current?.(elapsed.current);
      }
      // Max ~20-30 redraws/sec; settle after ten seconds of idle. Background/focus/reduced-motion stop RAF.
      if (motion && (busy || now - start < 10000))
        raf = requestAnimationFrame(frame);
    };
    draw.current?.(elapsed.current);
    if (motion) raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready, motion, busy, context]);
  const create = (gl: ExpoWebGLRenderingContext) => {
    if (!alive.current) return;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null,
      buffer: WebGLBuffer | null = null;
    const cleanup = () => {
      try {
        if (program) gl.deleteProgram(program);
        if (buffer) gl.deleteBuffer(buffer);
        shaders.forEach((s) => gl.deleteShader(s));
      } catch {}
    };
    try {
      const compile = (kind: number, source: string) => {
        const s = gl.createShader(kind)!;
        shaders.push(s);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error();
        return s;
      };
      program = gl.createProgram()!;
      gl.attachShader(
        program,
        compile(
          gl.VERTEX_SHADER,
          "attribute vec2 position; varying vec2 vUv; void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}",
        ),
      );
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, SILK_FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error();
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      const p = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(p);
      gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
      const u = (name: string) => gl.getUniformLocation(program!, name);
      gl.uniform3f(u("uColor"), 0.18, 0.42, 0.27);
      gl.uniform1f(u("uScale"), 0.8);
      gl.uniform1f(u("uSpeed"), 5);
      gl.uniform1f(u("uNoiseIntensity"), 0.6);
      gl.uniform1f(u("uRotation"), -0.45);
      gl.uniform1f(u("uLightMode"), 0);
      const time = u("uTime");
      draw.current = (t) => {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(program);
        gl.uniform1f(time, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
        gl.endFrameEXP();
      };
      dispose.current = cleanup;
      setReady(true);
    } catch {
      cleanup();
    }
  };
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
    >
      <GLView
        msaaSamples={0}
        style={StyleSheet.absoluteFill}
        onContextCreate={create}
      />
    </View>
  );
}
