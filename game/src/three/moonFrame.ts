// Moon-fixed frame used everywhere in Rover Run (textures, pins, route, camera):
//   +y = north pole, +z = 0°N 0°E (sub-Earth point), +x = 0°N 90°E.
// Same convention as scripts/build-moon-textures.mjs, so baked normals line up with the globe.

import { Vector3 } from "three";

export const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export function latLonToVec(lat: number, lon: number, r = 1, out = new Vector3()): Vector3 {
  const phi = lat * DEG;
  const lam = lon * DEG;
  return out.set(r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam));
}

export function vecToLatLon(v: Vector3): LatLon {
  const n = v.clone().normalize();
  return { lat: Math.asin(Math.max(-1, Math.min(1, n.y))) / DEG, lon: Math.atan2(n.x, n.z) / DEG };
}

/** Point a fraction t of the way along the great circle from a to b (unit vectors). */
export function slerpDir(a: Vector3, b: Vector3, t: number, out = new Vector3()): Vector3 {
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return out.copy(a);
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb).normalize();
}

/** Local east / north / up unit vectors at a point on the sphere (north falls back near the poles). */
export function enuAt(p: Vector3) {
  const up = p.clone().normalize();
  const pole = new Vector3(0, 1, 0);
  let north = pole.clone().sub(up.clone().multiplyScalar(pole.dot(up)));
  if (north.lengthSq() < 1e-10) north = new Vector3(0, 0, up.y > 0 ? -1 : 1);
  north.normalize();
  const east = new Vector3().crossVectors(north, up).normalize();
  return { east, north, up };
}

/** Unit tangent at p pointing along the great circle toward q. */
export function headingTo(p: Vector3, q: Vector3): Vector3 {
  const h = q.clone().sub(p.clone().multiplyScalar(p.dot(q)));
  if (h.lengthSq() < 1e-12) return enuAt(p).north;
  return h.normalize();
}
