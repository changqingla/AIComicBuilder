import { runMigrations } from "@/lib/db";
import { initializeProviders } from "@/lib/ai/setup";

let bootstrapped = false;

export function bootstrap() {
  if (bootstrapped) return;
  runMigrations();
  initializeProviders();
  bootstrapped = true;
}
