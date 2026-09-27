import React, { useEffect, useRef, useState } from "react";
import { PixelRatio, StyleSheet, View } from "react-native";
import { GLView, ExpoWebGLRenderingContext } from "expo-gl";
import { SPECULAR_FRAGMENT } from "./specularShader";
import { useSceneMotion } from "../../hooks/useSceneMotion";
/** Actual React Bits shader, rendered through Expo GL. One canvas on the main action only. */
export function SpecularRim({
  pressed,
  touchX = 0.5,
}: {
  pressed: boolean;
  touchX?: number;
}) {
  const motion = useSceneMotion();
  const [ready, setReady] = useState(false);
  const draw = useRef<((angle: number, brightness: number) => void) | null>(
    null,
  );
  const dispose = useRef<(() => void) | null>(null);
  const pointer = useRef({ pressed, touchX });
  pointer.current = { pressed, touchX };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dispose.current?.();
      draw.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let raf = 0,
      last = performance.now(),
      angle = 2.4,
      bright = 0.65;
    const started = last;
    const update = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const target = pointer.current.pressed
        ? 2.4 + (pointer.current.touchX - 0.5) * 0.6
        : 2.4 + Math.min((now - started) / 1000, 1.8) * 0.35;
      const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      angle += diff * (1 - Math.exp(-dt * 7));
      bright +=
        ((pointer.current.pressed ? 1.7 : 0.65) - bright) *
        (1 - Math.exp(-dt * 8));
      draw.current?.(motion ? angle : 2.4, motion ? bright : 0.65);
      // Finite idle settle; no permanent animation or battery loop on a resting button.
      if (motion && (pointer.current.pressed || now - started < 2200))
        raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [ready, pressed, motion]);
  const create = (gl: ExpoWebGLRenderingContext) => {
    if (!mounted.current) return;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null,
      buffer: WebGLBuffer | null = null;
    try {
      const shader = (type: number, source: string) => {
        const s = gl.createShader(type)!;
        shaders.push(s);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw Error("shader compile");
        return s;
      };
      program = gl.createProgram()!;
      gl.attachShader(
        program,
        shader(
          gl.VERTEX_SHADER,
          "attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}",
        ),
      );
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, SPECULAR_FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error("shader link");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const names = [
        "uCenter",
        "uHalfSize",
        "uRadius",
        "uAngle",
        "uPx",
        "uLineColor",
        "uBaseColor",
        "uIntensity",
        "uShineSize",
        "uShineFade",
        "uThickness",
        "uBaseWidth",
      ];
      const u = Object.fromEntries(
        names.map((n) => [n, gl.getUniformLocation(program!, n)]),
      );
      draw.current = (angle, intensity) => {
        const w = gl.drawingBufferWidth,
          h = gl.drawingBufferHeight,
          px = PixelRatio.get();
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniform2f(u.uCenter, w / 2, h / 2);
        gl.uniform2f(u.uHalfSize, w / 2 - px, h / 2 - px);
        gl.uniform1f(u.uRadius, Math.min(25 * px, h / 2 - px));
        gl.uniform1f(u.uAngle, angle);
        gl.uniform1f(u.uPx, px);
        gl.uniform3f(u.uLineColor, 0.8, 1, 0.86);
        gl.uniform3f(u.uBaseColor, 0.24, 0.45, 0.33);
        gl.uniform1f(u.uIntensity, intensity);
        gl.uniform1f(u.uShineSize, (10 * Math.PI) / 180);
        gl.uniform1f(u.uShineFade, (40 * Math.PI) / 180);
        gl.uniform1f(u.uThickness, px);
        gl.uniform1f(u.uBaseWidth, px);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
        gl.endFrameEXP();
      };
      dispose.current = () => {
        try {
          if (buffer) gl.deleteBuffer(buffer);
          if (program) gl.deleteProgram(program);
          shaders.forEach((s) => gl.deleteShader(s));
        } catch {}
      };
      setReady(true);
    } catch {
      // Glass border underneath remains usable even on a device without GL support.
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
    }
  };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GLView
        msaaSamples={0}
        style={StyleSheet.absoluteFill}
        onContextCreate={create}
      />
    </View>
  );
}
