const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

// Shopify Services
const {
    getAllBlogs,
    getArticlesByBlog,
    createBlogArticle,
    getAllProducts,
    getAllCollections,
    getProductsByCollection
} = require("../services/shopify");

// OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/* -------------------------------------------------------------
   🔥 ROUTE 1 : GET /blogs
-------------------------------------------------------------- */
router.get("/blogs", async (req, res) => {
    try {
        const blogs = await getAllBlogs();

        const blogsWithArticles = await Promise.all(
            blogs.map(async (b) => {
                const articles = await getArticlesByBlog(b.id);
                return {
                    ...b,
                    url_base: process.env.SHOPIFY_SHOP_URL,
                    articles_count: articles.length,
                    articles: articles.map(a => ({
                        id: a.id,
                        title: a.title,
                        handle: a.handle,
                        created_at: a.created_at,
                        url: `https://${process.env.SHOPIFY_SHOP_URL}/blogs/${b.handle}/${a.handle}`
                    }))
                };
            })
        );

        res.json({ success: true, blogs: blogsWithArticles });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 ROUTE 2 : GET /blogs/:blogId/articles
-------------------------------------------------------------- */
router.get("/blogs/:blogId/articles", async (req, res) => {
    try {
        const { blogId } = req.params;
        const articles = await getArticlesByBlog(blogId);
        res.json({ success: true, articles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 ROUTE 3 : POST /blogs/create
-------------------------------------------------------------- */
router.post("/blogs/create", async (req, res) => {
    try {
        const { blogId, topic, scheduleDate } = req.body;

        if (!blogId || !topic) {
            return res.status(400).json({ error: "Missing blogId or topic" });
        }

        const collections = await getAllCollections();
        const relatedCollection =
            collections.find(c =>
                c.title.toLowerCase().includes(topic.toLowerCase())
            ) || collections[0];

        const products = await getProductsByCollection(relatedCollection.id);

        // Génération produits HTML
        const productHTML = products.slice(0, 4).map(p => `
            <div class="blog-product-card">
                <img src="${p?.image?.src || ""}" alt="${p.title}">
                <h3>${p.title}</h3>
                <p>${(p.body_html || "").replace(/<[^>]+>/g, "").slice(0, 120)}...</p>
                <a href="/products/${p.handle}">Voir le produit</a>
            </div>
        `).join("");

        const showcaseHTML = `
            <div class="blog-products-showcase">
                ${productHTML}
            </div>
        `;

        // Prompt IA
        const prompt = `
Rédige un article SEO de 800-1200 mots sur : "${topic}".
HTML propre uniquement. Pas d’emojis.

Ajoute ce bloc EXACT à la fin :
${showcaseHTML}

Réponds UNIQUEMENT avec :
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

        const newArticle = await createBlogArticle(blogId, {
            title: json.title,
            body_html: json.content_html,
            published_at: scheduleDate || null
        });

        res.json({ success: true, created: newArticle });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 AUTOMATISATION QUOTIDIENNE
-------------------------------------------------------------- */

let autoBlogEnabled = false;
let autoBlogTime = "09:00";
let autoBlogTimer = null;

// STATUS
router.get("/blogs/auto/status", (req, res) => {
    res.json({
        success: true,
        enabled: autoBlogEnabled,
        time: autoBlogTime
    });
});

// START AUTOMATION
router.post("/blogs/auto/start", (req, res) => {
    const { time } = req.body;

    if (!time) return res.json({ success: false, error: "Missing time" });

    autoBlogEnabled = true;
    autoBlogTime = time;

    if (autoBlogTimer) clearInterval(autoBlogTimer);

    autoBlogTimer = setInterval(async () => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, "0");
        const m = String(now.getMinutes()).padStart(2, "0");

        if (autoBlogEnabled && `${h}:${m}` === autoBlogTime) {
            await autoBlogGenerate();
        }
    }, 60000);

    res.json({ success: true });
});

// STOP AUTOMATION
router.post("/blogs/auto/stop", (req, res) => {
    autoBlogEnabled = false;
    if (autoBlogTimer) clearInterval(autoBlogTimer);
    res.json({ success: true });
});

// FUNCTION AUTOMATION
async function autoBlogGenerate() {
    try {
        const blogs = await getAllBlogs();
        const collections = await getAllCollections();

        if (!blogs.length) return;

        const blogId = blogs[0].id;
        const c = collections[Math.floor(Math.random() * collections.length)];

        await fetch(`${process.env.SERVER_URL}/api/blogs/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                blogId,
                topic: `Astuces et nouveautés : ${c.title}`,
                scheduleDate: null
            })
        });

        console.log("✔ Article auto généré");

    } catch (err) {
        console.log("❌ AutoBlog error:", err.message);
    }
}

module.exports = router;
