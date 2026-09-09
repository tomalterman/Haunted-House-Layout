import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { FLOORPLAN } from "../src/floorplan.js";
import { TEAMS } from "../src/teams.js";
import { mapToWorld, buildScene } from "../src/walk/walk-view.js";

// A stand-in for the floor texture canvas: three's CanvasTexture only needs
// width and height until a renderer uploads it.
const fakeCanvas = { width: 1700, height: 1200 };

function build() {
  return buildScene(FLOORPLAN, TEAMS, { THREE, floorCanvas: fakeCanvas });
}

function worldPoint(object, x, y, z) {
  object.updateMatrixWorld(true);
  return new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld);
}

describe("mapToWorld", () => {
  it("maps feet x to world x and feet y to world z with y up", () => {
    expect(mapToWorld([10, 10])).toEqual([10, 0, 10]);
    expect(mapToWorld([0, 51])).toEqual([0, 0, 51]);
  });
});

describe("buildScene", () => {
  it("returns a scene holding the floor, walls, tents, stage, and gym", () => {
    const built = build();
    expect(built.scene).toBeInstanceOf(THREE.Scene);
    expect(built.floor.parent).toBe(built.scene);
    expect(built.stage.parent).toBe(built.scene);
    expect(built.gym.parent).toBe(built.scene);
    for (const wall of built.walls) expect(wall.parent).toBe(built.scene);
    for (const tent of built.tents) expect(tent.parent).toBe(built.scene);
  });

  it("places one mesh per wall segment at the midpoint with map y on the z axis", () => {
    const { walls } = build();
    expect(walls).toHaveLength(FLOORPLAN.walls.length);
    for (const wall of FLOORPLAN.walls) {
      const mesh = walls.find((m) => m.userData.wallId === wall.id);
      expect(mesh, wall.id).toBeInstanceOf(THREE.Mesh);
      const [ax, ay] = wall.a;
      const [bx, by] = wall.b;
      expect(mesh.position.x).toBeCloseTo((ax + bx) / 2, 6);
      expect(mesh.position.y).toBeCloseTo(FLOORPLAN.wallHeight / 2, 6);
      expect(mesh.position.z).toBeCloseTo((ay + by) / 2, 6);

      const length = Math.hypot(bx - ax, by - ay);
      const { width, height, depth } = mesh.geometry.parameters;
      expect(width).toBeCloseTo(length, 6);
      expect(height).toBe(FLOORPLAN.wallHeight);
      expect(depth).toBeCloseTo(wall.thickness, 6);

      // The box's local +x end lands on endpoint b, so the yaw follows the segment.
      const end = worldPoint(mesh, length / 2, 0, 0);
      expect(end.x).toBeCloseTo(bx, 6);
      expect(end.z).toBeCloseTo(by, 6);
      expect(end.y).toBeCloseTo(FLOORPLAN.wallHeight / 2, 6);
    }
  });

  it("uses black material with a slight sheen for the walls", () => {
    const { walls } = build();
    for (const mesh of walls) {
      expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(mesh.material.color.getHex()).toBeLessThan(0x202020);
      expect(mesh.material.roughness).toBeLessThan(1);
    }
  });

  it("makes six canopy groups at the tent centers and no wall mesh for a tent", () => {
    const { tents, walls } = build();
    expect(tents).toHaveLength(6);
    for (const tent of FLOORPLAN.tents) {
      const group = tents.find((g) => g.userData.tentId === tent.id);
      expect(group, tent.id).toBeInstanceOf(THREE.Group);
      expect(group.position.x).toBeCloseTo(tent.x + tent.size / 2, 6);
      expect(group.position.y).toBeCloseTo(0, 6);
      expect(group.position.z).toBeCloseTo(tent.y + tent.size / 2, 6);

      // Four thin legs 7 feet tall at the corners, and a roof sitting at 7 feet.
      const legs = group.children.filter((c) => c.userData.part === "leg");
      expect(legs).toHaveLength(4);
      for (const leg of legs) {
        expect(leg.geometry.parameters.height).toBe(7);
        expect(Math.abs(leg.position.x)).toBeCloseTo(tent.size / 2 - 0.1, 6);
        expect(Math.abs(leg.position.z)).toBeCloseTo(tent.size / 2 - 0.1, 6);
      }
      const roof = group.children.find((c) => c.userData.part === "roof");
      expect(roof).toBeDefined();
      const roofBase = worldPoint(roof, 0, -roof.geometry.parameters.height / 2, 0);
      expect(roofBase.y).toBeCloseTo(7, 6);
      // No panel for a tent: they are open canopies, not collision walls.
      expect(walls.some((m) => m.userData.wallId === tent.id)).toBe(false);
      expect(walls.some((m) => m.userData.tentId)).toBe(false);
    }
  });

  it("puts the floor plane at (42.5, 0, 30) rotated -pi/2 about X so texture top is world z = 0", () => {
    const { floor } = build();
    expect(floor.position.x).toBeCloseTo(42.5, 6);
    expect(floor.position.y).toBeCloseTo(0, 6);
    expect(floor.position.z).toBeCloseTo(30, 6);
    expect(floor.rotation.x).toBeCloseTo(-Math.PI / 2, 6);
    expect(floor.geometry.parameters.width).toBe(85);
    expect(floor.geometry.parameters.height).toBe(60);

    const material = floor.material;
    expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.map.image).toBe(fakeCanvas);
    expect(material.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.map.flipY).toBe(true);

    // With flipY the canvas top row is uv v = 1. That vertex must land at world z = 0,
    // and the bottom-right of the canvas (u = 1, v = 0) at world (85, 0, 60).
    const uv = floor.geometry.attributes.uv;
    const pos = floor.geometry.attributes.position;
    const find = (u, v) => {
      for (let i = 0; i < uv.count; i++) {
        if (Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - v) < 1e-6) {
          return worldPoint(floor, pos.getX(i), pos.getY(i), pos.getZ(i));
        }
      }
      throw new Error(`no vertex with uv ${u},${v}`);
    };
    const topLeft = find(0, 1);
    expect(topLeft.x).toBeCloseTo(0, 6);
    expect(topLeft.y).toBeCloseTo(0, 6);
    expect(topLeft.z).toBeCloseTo(0, 6);
    const bottomRight = find(1, 0);
    expect(bottomRight.x).toBeCloseTo(85, 6);
    expect(bottomRight.z).toBeCloseTo(60, 6);
  });

  it("builds the gym as an 85 by 24 by 60 box seen from inside, with lights", () => {
    const { gym, scene } = build();
    const { width, height, depth } = gym.geometry.parameters;
    expect([width, height, depth]).toEqual([85, 24, 60]);
    expect(gym.material.side).toBe(THREE.BackSide);
    expect(gym.position.x).toBeCloseTo(42.5, 6);
    expect(gym.position.z).toBeCloseTo(30, 6);

    const lights = [];
    scene.traverse((o) => {
      if (o.isLight) lights.push(o);
    });
    expect(lights.some((l) => l.isHemisphereLight)).toBe(true);
    expect(lights.some((l) => l.isDirectionalLight)).toBe(true);
  });

  it("raises the stage 4 feet at the gym's bottom edge with a dark blue curtain behind it", () => {
    const { stage, scene } = build();
    const s = FLOORPLAN.stage;
    expect(stage.geometry.parameters.height).toBe(4);
    expect(stage.position.x).toBeCloseTo(s.x + s.w / 2, 6);
    expect(stage.position.y).toBeCloseTo(2, 6);
    expect(stage.position.z).toBeCloseTo(s.y + s.h / 2, 6);

    const curtain = scene.getObjectByName("curtain");
    expect(curtain).toBeDefined();
    expect(curtain.position.z).toBeGreaterThan(59);
    expect(curtain.position.z).toBeLessThanOrEqual(60);
    const { r, g, b } = curtain.material.color;
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });
});
