/**
 * İki veritabanına yayılan işlemlerin geri alınması (tek transaction mümkün değil). Her başarılı adım
 * kendi geri alma işini kaydeder; sonraki bir adım patlarsa kayıtlar ters sırayla çalıştırılır.
 * Geri alma adımlarından biri de patlarsa diğerleri yine denenir; patlayanların adı döner (loglanır).
 */
export interface Compensator {
  /** Başarılı adımın geri alma işini kaydeder. */
  push(name: string, undo: () => Promise<void>): void;
  /** Kayıtlı geri almaları ters sırayla çalıştırır; başarısız olanların adlarını döner. */
  rollback(): Promise<string[]>;
}

export function createCompensator(): Compensator {
  const undos: { name: string; undo: () => Promise<void> }[] = [];
  return {
    push(name, undo) {
      undos.push({ name, undo });
    },
    async rollback() {
      const failed: string[] = [];
      for (const { name, undo } of undos.splice(0).reverse()) {
        try {
          await undo();
        } catch {
          failed.push(name);
        }
      }
      return failed;
    },
  };
}
