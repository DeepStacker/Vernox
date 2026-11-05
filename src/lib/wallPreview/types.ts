export interface Point {
  x: number;
  y: number;
}

/** Four points in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** A flat piece's outline: an SVG path in millimetres, origin at the top-left of its bounding box. */
export interface Outline {
  svgPath: string;
  widthMm: number;
  heightMm: number;
}

/** Where the light comes from, as a vector pointing from the wall towards the light (x right, y down). */
export interface LightConfig {
  fromX: number;
  fromY: number;
  /** 0 (hard, direct) to 1 (very diffuse). Drives shadow blur. */
  softness: number;
  /** Colour of the key light, used to tint highlights. */
  colour: string;
  /** Ambient room colour used for a subtle tint over the metal. */
  ambient: string;
  /** 0..1 strength of the ambient tint. */
  ambientStrength: number;
}

export interface SceneFurniture {
  label: string;
  widthCm: number;
}

export interface SceneConfig {
  id: string;
  label: string;
  /** Path served from the site root (public/). */
  image: string;
  /** Natural size of the image in pixels (calibration is expressed in these pixels). */
  imageWidth: number;
  imageHeight: number;
  /**
   * The usable wall plane in image pixels: TL, TR, BR, BL of a rectangle that is
   * `wall.widthCm` x `wall.heightCm` in the real world. Perspective comes from this quad.
   */
  wall: { corners: Quad; widthCm: number; heightCm: number };
  /**
   * Rectangle (image pixels) covering the photo's own artwork. It is filled with the surrounding
   * wall colour so our piece does not sit on top of another picture.
   */
  clearZone: { x: number; y: number; w: number; h: number };
  /** Default centre of the piece in wall centimetres (origin top-left of the wall plane, y down). */
  defaultCentreCm: Point;
  light: LightConfig;
  furniture?: SceneFurniture;
}
