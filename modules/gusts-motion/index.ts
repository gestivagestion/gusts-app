import { requireNativeModule, EventEmitter } from 'expo-modules-core';

const GustsMotionModule = requireNativeModule('GustsMotion');
const emitter = new EventEmitter(GustsMotionModule as any);

export function start() {
  GustsMotionModule.start();
}

export function stop() {
  GustsMotionModule.stop();
}

export function addAccelerometerListener(
  listener: (event: { x: number; y: number; z: number; timestamp: number }) => void
) {
  return emitter.addListener('onAccelerometerData', listener);
}
