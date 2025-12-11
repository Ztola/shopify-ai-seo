// auto-blog.js
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { 
    getAllCollections,
    getProductsByCollection,
    createBlogArticle
} = require("./services/shopify");

const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fichier de configuration
const configPath = path.join(__dirname, "auto-blog-config.json");

// Charger ou créer config
function loadConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
            enabled: false,
            time: "09:00",
            last_run: null
        }, null, 2));
    }
    return JSON.parse(fs.readFileSync(configPath));
}

// Sauver config
function saveConfig(data) {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

// CRON actif ?
let cronTask = null;

// Fonction principale : générer un article
async function generateDailyArticle() {
    try {
        console.log("📝 Génération automatique du blog…");

        const config = loadConfig();
        const collections = await getAllCollections();
        const chosenCollection = collections[Math.floor(Math.random() * collections.length)];

        // Récup produit collection
        const products = await getProductsByCollection(chosenCollection.id);
        const keyword = chosenCollection.title;

        // Structure du prompt
        const prompt = `
Tu es expert SEO Shopify. Rédige un article optimisé sur : "${keyword}".
HTML propre, 800-1200 mots, H2/H3, pas d’emoji.
`;

        // Génération IA
        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            messages: [{ role: "user", content: prompt }]
        });

        const raw = ai.choices[0].message.content.trim();
        const json = JSON.parse(raw.replace(/```json|```/g, ""));

        // Publier article
        const newArticle = await createBlogArticle(
            process.env.AUTO_BLOG_ID, // 🔥 ID du blog cible défini dans .env
            {
                title: json.title,
                body_html: json.content_html
            }
        );

        config.last_run = new Date().toISOString();
        saveConfig(config);

        console.log("✔ Article automatique publié !");
        return newArticle;

    } catch (err) {
        console.error("❌ Erreur CRON :", err.message);
    }
}

// Démarrer le CRON
function startCron() {
    const config = loadConfig();

    if (!config.enabled) return;

    const [hour, minute] = config.time.split(":");

    console.log(`⏰ CRON actif -> Tous les jours à ${config.time}`);

    cronTask = cron.schedule(`${minute} ${hour} * * *`, generateDailyArticle);
}

// Export
module.exports = {
    loadConfig,
    saveConfig,
    startCron,
    generateDailyArticle
};
