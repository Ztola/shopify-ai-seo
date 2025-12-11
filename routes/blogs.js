const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const {
    getAllBlogs,
    getArticlesByBlog,
    createBlogArticle,
    getAllCollections,
    getProductsByCollection
} = require("../services/shopify");

const {
    startAutoBlog,
    stopAutoBlog,
    getAutoBlogStatus,
    setAutoBlogConfig,
    generateAutoBlogArticle
} = require("../services/auto-blog");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/* ================================================================
   🟣 1. MODE MANUEL — /api/blogs (list + CRUD)
================================================================ */
router.get("/blogs", async (req, res) => {
    try {
        const shopUrl = req.headers["x-shopify-url"];
        console.log("📚 Récupération blogs pour :", shopUrl);

        const blogs = await getAllBlogs(req);

        const blogsExtended = await Promise.all(
            blogs.map(async b => {
                const articles = await getArticlesByBlog(req, b.id);

                return {
                    ...b,
                    url_base: shopUrl,
                    articles_count: articles.length,
                    articles: articles.map(a => ({
                        id: a.id,
                        title: a.title,
                        handle: a.handle,
                        url: `https://${shopUrl}/blogs/${b.handle}/${a.handle}`,
                        created_at: a.created_at
                    }))
                };
            })
        );

        res.json({ success: true, blogs: blogsExtended });

    } catch (err) {
        console.error("❌ /blogs ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ----------------------------------------------------------------
   🟣 2. MODE MANUEL — Création article manuel
---------------------------------------------------------------- */
router.post("/blogs/create", async (req, res) => {
    try {
        const { blogId, topic, scheduleDate } = req.body;

        if (!blogId || !topic) {
            return res.json({ success: false, error: "Missing parameters" });
        }

        // Cherche collection liée
        const cols = await getAllCollections(req);
        const match = cols.find(c =>
            c.title.toLowerCase().includes(topic.toLowerCase())
        ) || cols[0];

        const products = await getProductsByCollection(req, match.id);

        const showcase = `
            <div class="blog-products">
                ${products.slice(0, 4).map(p => `
                    <div class="bp-card">
                        <img src="${p?.image?.src || ""}">
                        <h3>${p.title}</h3>
                        <p>${(p.body_html || "").replace(/<[^>]+>/g, "").slice(0, 120)}...</p>
                        <a href="/products/${p.handle}">Voir →</a>
                    </div>
                `).join("")}
            </div>
        `;

        const prompt = `
Rédige un article SEO expert (900–1300 mots) sur : "${topic}".
Structure : H2, H3, paragraphes riches. Pas d’emojis.
Ajoute CE BLOC EXACT à la fin :
${showcase}

Réponds UNIQUEMENT en JSON :
{
 "title": "",
 "content_html": ""
}
`;

        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
        });

        const output = ai.choices[0].message.content.replace(/```json|```/g, "");
        const json = JSON.parse(output);

        const article = await createBlogArticle(req, blogId, {
            title: json.title,
            body_html: json.content_html,
            published_at: scheduleDate || null
        });

        res.json({ success: true, created: article });

    } catch (err) {
        console.error("❌ /blogs/create ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ================================================================
   🔵 3. AUTOMATISATION — Activation, Stop, Statut
================================================================ */

/* STATUS */
router.get("/blogs/auto/status", async (req, res) => {
    const status = await getAutoBlogStatus();
    res.json({ success: true, ...status });
});

/* START */
router.post("/blogs/auto/start", async (req, res) => {
    const { time } = req.body;

    if (!time) return res.json({ success: false, error: "Missing time" });

    await setAutoBlogConfig({
        enabled: true,
        time,
        shopUrl: req.headers["x-shopify-url"],
        token: req.headers["x-shopify-token"]
    });

    startAutoBlog();
    res.json({ success: true });
});

/* STOP */
router.post("/blogs/auto/stop", async (req, res) => {
    stopAutoBlog();
    res.json({ success: true });
});


module.exports = router;
