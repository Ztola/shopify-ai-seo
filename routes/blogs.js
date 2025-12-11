const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

// Shopify Services (req obligatoire dans chaque fonction)
const {
    getAllBlogs,
    getArticlesByBlog,
    createBlogArticle,
    getAllCollections,
    getProductsByCollection
} = require("../services/shopify");

// Auto-Blog CRON service
const {
    startAutoBlog,
    stopAutoBlog,
    updateActiveShopForCron
} = require("../services/auto-blog");

// IA
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


/* -------------------------------------------------------------
   🔥 MIDDLEWARE → chaque requête met à jour la boutique active
-------------------------------------------------------------- */
router.use((req, res, next) => {
    updateActiveShopForCron(req); // ← CRUCIAL pour autoblog multi-boutiques
    next();
});


/* -------------------------------------------------------------
   🔥 ROUTE 1 : GET /api/blogs (MULTI-BOUTIQUES)
-------------------------------------------------------------- */
router.get("/blogs", async (req, res) => {
    try {
        console.log("📚 Récupération des blogs pour :", req.headers["x-shopify-url"]);

        const blogs = await getAllBlogs(req);

        const blogsWithArticles = await Promise.all(
            blogs.map(async (b) => {
                const articles = await getArticlesByBlog(req, b.id);

                return {
                    ...b,
                    url_base: req.headers["x-shopify-url"],
                    articles_count: articles.length,
                    articles: articles.map(a => ({
                        id: a.id,
                        title: a.title,
                        handle: a.handle,
                        created_at: a.created_at,
                        url: `https://${req.headers["x-shopify-url"]}/blogs/${b.handle}/${a.handle}`
                    }))
                };
            })
        );

        res.json({ success: true, blogs: blogsWithArticles });

    } catch (error) {
        console.error("❌ /blogs ERROR:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});



/* -------------------------------------------------------------
   🔥 ROUTE 2 : GET /api/blogs/:blogId/articles
-------------------------------------------------------------- */
router.get("/blogs/:blogId/articles", async (req, res) => {
    try {
        const { blogId } = req.params;

        const articles = await getArticlesByBlog(req, blogId);

        res.json({ success: true, articles });

    } catch (error) {
        console.error("❌ /blogs/:id/articles ERROR:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});



/* -------------------------------------------------------------
   🔥 ROUTE 3 : POST /api/blogs/create
-------------------------------------------------------------- */
router.post("/blogs/create", async (req, res) => {
    try {
        const { blogId, topic, scheduleDate } = req.body;

        if (!blogId || !topic) {
            return res.status(400).json({ error: "Missing blogId or topic" });
        }

        const collections = await getAllCollections(req);

        const relatedCollection =
            collections.find(c =>
                c.title.toLowerCase().includes(topic.toLowerCase())
            ) || collections[0];

        const products = await getProductsByCollection(req, relatedCollection.id);

        const productHTML = products.slice(0, 4).map(p => `
            <div class="blog-product-card">
                <img src="${p?.image?.src || ""}" alt="${p.title}">
                <h3>${p.title}</h3>
                <p>${(p.body_html || "").replace(/<[^>]+>/g, "").slice(0, 120)}...</p>
                <a href="/products/${p.handle}">Voir le produit</a>
            </div>
        `).join("");

        const finalHTML = `
            <div class="blog-products-showcase">
                ${productHTML}
            </div>
        `;

        const prompt = `
Rédige un article SEO de 900 à 1200 mots sur : "${topic}".
HTML propre uniquement. Pas d’emojis.

Ajoute ce bloc EXACT à la fin :
${finalHTML}

Réponds uniquement avec du JSON :
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

        let output = ai.choices[0].message.content.trim();
        output = output.replace(/```json|```/g, "");
        const json = JSON.parse(output);

        const newArticle = await createBlogArticle(req, blogId, {
            title: json.title,
            body_html: json.content_html,
            published_at: scheduleDate || null
        });

        res.json({ success: true, created: newArticle });

    } catch (error) {
        console.error("❌ /blogs/create ERROR:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


/* -------------------------------------------------------------
   🔥 AUTOMATISATION QUOTIDIENNE (START / STOP / STATUS)
-------------------------------------------------------------- */

// GET STATUS
router.get("/blogs/auto/status", (req, res) => {
    res.json({
        success: true,
        enabled: global.autoBlogEnabled || false,
        time: global.autoBlogTime || "09:00"
    });
});

// START AUTO BLOG
router.post("/blogs/auto/start", (req, res) => {
    const { time } = req.body;

    if (!time) {
        return res.json({ success: false, error: "Missing time" });
    }

    startAutoBlog(time);

    res.json({
        success: true,
        message: "AutoBlog activé",
        time
    });
});

// STOP AUTO BLOG
router.post("/blogs/auto/stop", (req, res) => {
    stopAutoBlog();
    res.json({
        success: true,
        message: "AutoBlog désactivé"
    });
});



module.exports = router;
