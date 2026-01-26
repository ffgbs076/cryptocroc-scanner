import cron from "node-cron"
import fetch from "node-fetch"

cron.schedule("*/30 * * * *", async () => {
  await fetch("http://localhost:3000/api/scan?side=bull")
  await fetch("http://localhost:3000/api/scan?side=bear")
  console.log("✅ Scan opgeslagen", new Date().toISOString())
})
