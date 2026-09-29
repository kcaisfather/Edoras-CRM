// CRM kullanıcısı ekler / rolünü günceller (CRM projesi: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
//
// Kullanım:
//   node scripts/add-staff.mjs <e-posta> "<Ad Soyad>" [ADMIN|CRM_AGENT] [şifre]
//
// - Kullanıcı CRM projesinin Auth'unda yoksa açılır. Şifre verilmezse geçici şifre üretilip BİR KEZ yazılır.
// - Kullanıcı varsa şifresine yalnız şifre verildiyse dokunulur; crm_staff kaydı (rol, ad, aktif) güncellenir.
// - Edoras veritabanına dokunmaz.

import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

function loadEnvLocal() {
  const env = {};
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return env;
}

const [email, fullName, roleArg = "ADMIN", givenPassword] = process.argv.slice(2);
const role = roleArg.toUpperCase();
if (!email || !fullName || !["ADMIN", "CRM_AGENT"].includes(role)) {
  console.error('Kullanım: node scripts/add-staff.mjs <e-posta> "<Ad Soyad>" [ADMIN|CRM_AGENT] [şifre]');
  process.exit(1);
}
if (givenPassword !== undefined && givenPassword.length < 8) {
  console.error("Şifre en az 8 karakter olmalı.");
  process.exit(1);
}

const env = loadEnvLocal();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(".env.local içinde NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (CRM projesi) dolu olmalı.");
  process.exit(1);
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function temporaryPassword() {
  for (;;) {
    let out = "";
    for (let i = 0; i < 12; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    if (/[A-Z]/.test(out) && /[a-z]/.test(out) && /\d/.test(out)) return out;
  }
}

async function findUserId(address) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === address);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
}

const normalized = email.trim().toLowerCase();
let userId = await findUserId(normalized);
let password = null;
if (userId && givenPassword) {
  const { error } = await db.auth.admin.updateUserById(userId, { password: givenPassword });
  if (error) {
    console.error("Şifre güncellenemedi:", error.message);
    process.exit(1);
  }
}
if (!userId) {
  password = givenPassword ?? temporaryPassword();
  const { data, error } = await db.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error("Kullanıcı açılamadı:", error.message);
    process.exit(1);
  }
  userId = data.user.id;
}

const { error: staffError } = await db
  .from("crm_staff")
  .upsert({ user_id: userId, role, full_name: fullName, is_active: true }, { onConflict: "user_id" });
if (staffError) {
  console.error("crm_staff yazılamadı (migration uygulandı mı?):", staffError.message);
  process.exit(1);
}

console.log(`✔ ${normalized} → ${role}`);
if (password && !givenPassword) console.log(`  Geçici şifre (bir kez gösterilir): ${password}`);
if (givenPassword) console.log("  Verilen şifre ayarlandı.");
