import axios from "axios";
import dotenv from "dotenv";
import eavtoService from "./src/services/eavtoService.js";

dotenv.config();

// API Configuration - uses environment variables
const API_BASE_URL =
  process.env.API_URL || "https://webview-server.test-avtomaktab.uz/api";

// Languages
const LANGUAGES = {
  UZBEK: 1,
  RUSSIAN: 2,
  CYRILLIC_UZBEK: 3,
};

const LANGUAGE_NAMES = {
  1: "Ozbekcha (Lotin)",
  2: "Русский",
  3: "Ўзбекча (Кирилл)",
};

// Templates to sync (1-60)
const TEMPLATES = Array.from({ length: 60 }, (_, i) => i + 1);

// All languages (Rus, Uzb lotin, Uzb kiril)
const LANGUAGES_TO_SYNC = [
  LANGUAGES.RUSSIAN,
  LANGUAGES.UZBEK,
  LANGUAGES.CYRILLIC_UZBEK,
];

class SyncAutomation {
  constructor() {
    this.token = null;
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      errors: [],
    };
  }

  // Login and get auth token via eavtoService
  async login() {
    try {
      console.log("🔐 EAVTO API ga kirish...");
      const result = await eavtoService.login();
      if (result) {
        console.log("✅ Muvaffaqiyatli kirdingiz!\n");
        return true;
      } else {
        throw new Error("Token topilmadi");
      }
    } catch (error) {
      console.error("❌ Login xatosi:", error.message);
      return false;
    }
  }

  // Sync single template for specific language
  async syncTemplate(templateId, langId) {
    try {
      const langName = LANGUAGE_NAMES[langId];
      console.log(`\n📥 Shablon ${templateId} - ${langName} yuklanmoqda...`);

      const response = await axios.post(
        `${API_BASE_URL}/admin/sync/template`,
        {
          templateId,
          langId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.success) {
        const data = response.data.data;
        console.log(
          `✅ Shablon ${templateId} - ${langName} muvaffaqiyatli yuklandi!`
        );
        console.log(
          `   📊 Jami: ${data.totalQuestions}, Yangi: ${data.newQuestions}, Yangilangan: ${data.updatedQuestions}`
        );
        console.log(`   ⏱️  Vaqt: ${data.duration}s`);

        this.stats.success++;
        return true;
      } else {
        throw new Error(response.data.message || "Noma'lum xato");
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      console.error(
        `❌ Shablon ${templateId} - ${LANGUAGE_NAMES[langId]} xato: ${errorMsg}`
      );

      this.stats.failed++;
      this.stats.errors.push({
        templateId,
        langId,
        error: errorMsg,
      });

      return false;
    }
  }

  // Delay helper
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Main sync function
  async syncAll() {
    console.log("🚀 Barcha shablonlar uchun sinxronizatsiya boshlandi!\n");
    console.log(`📋 Shablonlar: ${TEMPLATES.length} ta (1-60)`);
    console.log(
      `🌐 Tillar: ${LANGUAGES_TO_SYNC.length} ta (Rus, Uzb lotin, Uzb kiril)`
    );
    console.log(
      `🔢 Jami so'rovlar: ${TEMPLATES.length * LANGUAGES_TO_SYNC.length}\n`
    );
    console.log("=".repeat(70));

    const startTime = Date.now();

    // Login first
    const loggedIn = await this.login();
    if (!loggedIn) {
      console.error("❌ Login amalga oshmadi. Dastur to'xtatildi.");
      return;
    }

    // Sync each template with each language
    for (let i = 0; i < TEMPLATES.length; i++) {
      const templateId = TEMPLATES[i];
      console.log(`\n${"=".repeat(70)}`);
      console.log(`📦 SHABLON ${templateId} (${i + 1}/${TEMPLATES.length})`);
      console.log("=".repeat(70));

      for (const langId of LANGUAGES_TO_SYNC) {
        this.stats.total++;
        await this.syncTemplate(templateId, langId);

        // Wait 2 seconds between requests to avoid rate limiting
        await this.delay(2000);
      }

      // Wait 3 seconds between templates
      if (i < TEMPLATES.length - 1) {
        console.log(
          "\n⏳ Keyingi shablonga o'tish uchun 3 soniya kutilmoqda..."
        );
        await this.delay(3000);
      }
    }

    // Print final stats
    const endTime = Date.now();
    const totalDuration = Math.floor((endTime - startTime) / 1000);

    console.log("\n" + "=".repeat(70));
    console.log("📊 YAKUNIY NATIJALAR");
    console.log("=".repeat(70));
    console.log(`✅ Jami so'rovlar: ${this.stats.total}`);
    console.log(`✅ Muvaffaqiyatli: ${this.stats.success}`);
    console.log(`❌ Xatolar: ${this.stats.failed}`);
    console.log(
      `⏱️  Umumiy vaqt: ${Math.floor(totalDuration / 60)}m ${
        totalDuration % 60
      }s`
    );

    if (this.stats.errors.length > 0) {
      console.log("\n❌ XATOLAR RO'YXATI:");
      this.stats.errors.forEach((err, index) => {
        console.log(
          `   ${index + 1}. Shablon ${err.templateId} - Til ${err.langId}: ${
            err.error
          }`
        );
      });
    }

    console.log("\n✅ Jarayon yakunlandi!");
  }
}

// Run the sync
const automation = new SyncAutomation();
automation.syncAll().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
