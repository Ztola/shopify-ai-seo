router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // 1️⃣ Récupérer produit actuel Shopify
    const product = await getProductById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // 2️⃣ Générer une version optimisée (remplaçable par OpenAI)
    const optimizedTitle = `✨ Optimized: ${product.title}`;
    const optimizedDescription = `<p>${product.body_html} (version optimisée)</p>`;

    // 3️⃣ Mettre à jour Shopify via ton service
    await require("../services/shopify").updateProduct(productId, {
      title: optimizedTitle,
      body_html: optimizedDescription,
      handle: product.handle
    });

    // 4️⃣ Marquer le produit comme optimisé
    await require("../services/shopify").markAsOptimized(productId);

    // 5️⃣ Retourner le résultat
    res.json({
      success: true,
      original_title: product.title,
      optimized_title: optimizedTitle,
      message: "Produit mis à jour sur Shopify ✔"
    });

  } catch (error) {
    console.error("❌ Error optimize-product:", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});
