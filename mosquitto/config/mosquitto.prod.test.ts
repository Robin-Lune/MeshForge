import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

const entrypoint = resolve("mosquitto/entrypoint.sh");
const template = resolve("mosquitto/config/mosquitto.prod.conf");

function render(): string {
  const dir = mkdtempSync(join(tmpdir(), "meshforge-mqtt-"));
  const rendered = join(dir, "mosquitto.conf");

  execFileSync("sh", [entrypoint, "true"], {
    env: {
      ...process.env,
      DB_PASSWORD: "secret",
      MOSQUITTO_CONFIG_TEMPLATE: template,
      MOSQUITTO_CONFIG: rendered,
    },
  });

  return readFileSync(rendered, "utf8");
}

describe("rendu ACL MQTT USER", () => {
  it("conserve les droits d'écriture et d'abonnement des USER", () => {
    const config = render();

    expect(config).toContain("('msh/#', 2)");
    expect(config).toContain("('msh/#', 4)");
  });

  it("lit le mode chat et le NodeID d'annonce dans mqtt_onboarding", () => {
    const config = render();

    expect(config).toContain("value->>'userChatEnabled'");
    expect(config).toContain("value->>'announcementNodeId'");
    expect(config).toContain("'msh/+/+/e/+/'");
    expect(config).not.toContain("MQTT_USER_CHAT_ENABLED");
    expect(config).not.toContain("MQTT_ANNOUNCEMENT_NODE_ID");
  });
});
