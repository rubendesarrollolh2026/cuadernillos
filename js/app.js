/**
 * Orquestador principal de la aplicación Cuadernillos
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("Cuadernillos Web Engine: TEST-2026-08-27-CACHE-BYPASS");

    let currentPDF = null;
    window.generatedBooklets = []; // Hacemos accesible la lista globalmente para UIManager

    // Listener para selección de archivo
    UIManager.elements.pdfInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        UIManager.setStatus("Analizando documento...");
        try {
            const arrayBuffer = await file.arrayBuffer();
            PDFProcessor.currentBuffer = arrayBuffer; // Guardamos el buffer para rasterización si falla pdf-lib
            currentPDF = await PDFProcessor.loadPDF(arrayBuffer);

            const pageCount = currentPDF.getPageCount();
            UIManager.showFileInfo(file.name, pageCount);
            UIManager.setStatus("Documento cargado correctamente.");
        } catch (error) {
            console.error(error);
            UIManager.setStatus(error.message, true);
        }
    });

    // Listener para cambio en tamaño de firma
    UIManager.elements.signatureSize.addEventListener('change', () => {
        if (currentPDF) {
            UIManager.updatePrediction(currentPDF.getPageCount(), parseInt(UIManager.elements.signatureSize.value));
        }
    });

    // Listener para botón de procesar
    UIManager.elements.processBtn.addEventListener('click', async () => {
        if (!currentPDF) return;

        const signatureSize = parseInt(UIManager.elements.signatureSize.value);
        const flipMode = UIManager.elements.flipMode.value;
        const totalPages = currentPDF.getPageCount();

        UIManager.setStatus("Generando cuadernillos... Por favor, no cierres la aplicación.");
        UIManager.elements.processBtn.disabled = true;

        // Limpiar anteriores
        window.generatedBooklets.forEach(b => URL.revokeObjectURL(b.url));
        window.generatedBooklets = [];

        try {
            const results = [];
            for (let start = 0; start < totalPages; start += signatureSize) {
                const end = Math.min(start + signatureSize - 1, totalPages - 1);

                // Procesar imposición
                const bookletDoc = await PDFProcessor.createBooklet(currentPDF, start, end, signatureSize, flipMode);

                // Generar Blob y URL
                const blob = await PDFProcessor.generateBlob(bookletDoc);
                const url = URL.createObjectURL(blob);

                const result = {
                    range: `${start + 1} - ${end + 1}`,
                    url: url,
                    blob: blob
                };

                window.generatedBooklets.push(result);
                results.push(result);
            }

            UIManager.renderBooklets(results);
            UIManager.setStatus("¡Cuadernillos listos!");
        } catch (error) {
            console.error("Error en procesamiento:", error);
            UIManager.setStatus("Error durante el procesamiento: " + error.message, true);
        } finally {
            UIManager.elements.processBtn.disabled = false;
        }
    });

    // Botón Descargar Todos
    UIManager.elements.downloadAllBtn.addEventListener('click', () => {
        window.generatedBooklets.forEach((b, index) => {
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = b.url;
                a.download = `cuadernillo_${index + 1}.pdf`;
                a.click();
            }, index * 300);
        });
    });

    // Botón de limpieza
    UIManager.elements.clearBtn.addEventListener('click', () => {
        window.generatedBooklets.forEach(b => URL.revokeObjectURL(b.url));
        window.generatedBooklets = [];
        currentPDF = null;
        PDFProcessor.currentBuffer = null;
        UIManager.reset();
    });
});
