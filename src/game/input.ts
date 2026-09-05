import { emptyInput, type Role, type RoleInput } from "./types";

/** Keyboard → one universal crew input packet (WASD/Space/Shift/Q/E). */
export class InputManager {
  keys = new Set<string>();
  enabled = true;

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (["Space", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
  };

  attach(_canvas: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  read(_role: Role, keysActive: boolean): RoleInput {
    const i = emptyInput();
    if (!keysActive || !this.enabled) return i;
    i.f = (this.down("KeyW", "ArrowUp") ? 1 : 0) - (this.down("KeyS", "ArrowDown") ? 1 : 0);
    i.s = (this.down("KeyD", "ArrowRight") ? 1 : 0) - (this.down("KeyA", "ArrowLeft") ? 1 : 0);
    i.a = this.down("Space");
    i.b = this.down("ShiftLeft", "ShiftRight");
    i.q = this.down("KeyQ");
    i.e = this.down("KeyE");
    return i;
  }
}

export function inputsEqual(a: RoleInput, b: RoleInput) {
  return a.f === b.f && a.s === b.s && a.a === b.a && a.b === b.b && a.q === b.q && a.e === b.e && Math.abs(a.lx - b.lx) < 0.002 && Math.abs(a.ly - b.ly) < 0.002;
}
