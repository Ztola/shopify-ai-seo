const cron = require("node-cron");
const { OpenAI } = require("openai");

const {
    getAllBlogs,
    getAllCollections,
    getProductsByCollection,
    createBlogArticle
} = require("./shopify");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

let cronJob = null;
let cronTime = "09:00"; // valeur par défaut
let enabled = false;

/* ---------------------------------------------------
   🔥 Fonction principale : Génération quotidienne
---------------------------------------------------- */
async function generateBlogForShop(req) {
    try {
        console.log("📝 AUTO-BLOG → génération pour :", req.headers["x-shopify-url"]);

        const blogs = await getAllBlogs(req);
        if (!blogs.length) return console.log("❌ Aucun blog trouvé.");

        const blogId = blogs[0].id;

        const collections = await getAllCollections(req);
        const chosen = collections[Math.floor(Math.random() * collections.length)];

        const products = await getProductsByCollection(req, chosen.id);

        const topic = `Conseils & Nouveautés : ${chosen.title}`;

        const prompt = `
Rédige un article SEO complet (900+ mots) sur : "${topic}".
HTML propre, H2/H3, pas d’emojis.

Réponds UNIQUEMENT avec :
{
  "title": "",
  "content_html": ""
}
        `;

        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            messages: [{ role: "user", content: prompt }],
        });

        const output = ai.choices[0].message.content.replace(/```json|```/g, "");
        const json = JSON.parse(output);

        const article = await createBlogArticle(req, blogId, {
            title: json.title,
            body_html: json.content_html,
            published_at: new Date().toISOString()
        });

        console.log("✔ Article automatique publié :", article.id);

    } catch (err) {
        console.error("❌ AUTO-BLOG ERROR :", err.message);
    }
}

/* ---------------------------------------------------
   🔥 Lancer le CRON
---------------------------------------------------- */
function startAutoBlog(time) {
    cronTime = time;
    enabled = true;

    if (cronJob) cronJob.stop();

    const [hour, minute] = time.split(":");

    cronJob = cron.schedule(`${minute} ${hour} * * *`, () => {
        console.log("⏰ CRON déclenché :", time);
        // On génère pour la boutique active (req simulée)
        global.autoBlogReq && generateBlogForShop(global.autoBlogReq);
    });

    console.log("🚀 Auto-blog activé à", time);
}

/* ---------------------------------------------------
   🔥 Arrêter le CRON
---------------------------------------------------- */
function stopAutoBlog() {
    enabled = false;
    if (cronJob) cronJob.stop();
    console.log("⛔ Auto-blog désactivé.");
}

/* ---------------------------------------------------
   🔥 Mettre à jour la boutique active pour le CRON
---------------------------------------------------- */
function updateActiveShopForCron(req) {
    global.autoBlogReq = req;
}

module.exports = {
    startAutoBlog,
    stopAutoBlog,
    updateActiveShopForCron,
};
