/**
 * Gestión de la Interfaz de Usuario mejorada
 */
const UIManager = {
    elements: {
        pdfInput: document.getElementById('pdf-input'),
        fileInfo: document.getElementById('file-info'),
        filename: document.getElementById('filename'),
        totalPages: document.getElementById('total-pages'),
        bookletsCount: document.getElementById('booklets-count'),
        signatureSize: document.getElementById('signature-size'),
        flipMode: document.getElementById('flip-mode'),
        processBtn: document.getElementById('process-btn'),
        resultsSection: document.getElementById('results-section'),
        bookletsList: document.getElementById('booklets-list'),
        downloadAllBtn: document.getElementById('download-all-btn'),
        clearBtn: document.getElementById('clear-btn'),
        statusMsg: document.getElementById('status-message'),
        statusText: document.getElementById('status-text'),
        // Modal
        previewModal: document.getElementById('preview-modal'),
        closePreview: document.getElementById('close-preview'),
        previewCanvas: document.getElementById('preview-canvas'),
        prevPageBtn: document.getElementById('prev-page'),
        nextPageBtn: document.getElementById('next-page'),
        currentPageSpan: document.getElementById('current-page'),
        totalPreviewPagesSpan: document.getElementById('total-preview-pages'),
        previewTitle: document.getElementById('preview-title')
    },

    currentPreviewPdf: null,
    currentPreviewPage: 1,

    init() {
        this.elements.closePreview.onclick = () => this.closePreview();
        this.elements.prevPageBtn.onclick = () => this.changePreviewPage(-1);
        this.elements.nextPageBtn.onclick = () => this.changePreviewPage(1);

        window.onclick = (event) => {
            if (event.target == this.elements.previewModal) this.closePreview();
        };
    },

    showFileInfo(name, pages) {
        this.elements.filename.textContent = name;
        this.elements.totalPages.textContent = pages;
        this.elements.fileInfo.classList.remove('hidden');
        this.elements.processBtn.disabled = false;
        this.updatePrediction(pages, parseInt(this.elements.signatureSize.value));
    },

    updatePrediction(totalPages, signatureSize) {
        if (!totalPages || isNaN(totalPages)) return;
        const count = Math.ceil(totalPages / signatureSize);
        this.elements.bookletsCount.textContent = count;
    },

    setStatus(text, isError = false) {
        this.elements.statusText.textContent = text;
        this.elements.statusMsg.classList.remove('hidden');
        this.elements.statusMsg.style.backgroundColor = isError ? '#ffebeb' : '#e8f0fe';
        this.elements.statusMsg.style.color = isError ? '#d93025' : '#1a73e8';
        this.elements.statusMsg.style.padding = '15px';
        this.elements.statusMsg.style.borderRadius = '8px';
        this.elements.statusMsg.style.marginTop = '15px';
        this.elements.statusMsg.style.fontWeight = '500';
    },

    hideStatus() {
        this.elements.statusMsg.classList.add('hidden');
    },

    renderBooklets(booklets) {
        this.elements.bookletsList.innerHTML = '';
        booklets.forEach((b, index) => {
            const item = document.createElement('div');
            item.className = 'booklet-item';
            item.innerHTML = `
                <h3>Cuadernillo ${index + 1}</h3>
                <p class="hint">Rango: ${b.range}</p>
                <div class="actions">
                    <button class="btn-small" onclick="UIManager.openPreview(${index})">Ver</button>
                    <button class="btn-small btn-print" onclick="UIManager.printPDF(${index})">Imprimir</button>
                    <button class="btn-small" onclick="UIManager.sharePDF(${index})">Compartir</button>
                    <button class="btn-small" onclick="UIManager.savePDF(${index})" style="background:#eee; color:black;">Guardar</button>
                </div>
            `;
            this.elements.bookletsList.appendChild(item);
        });
        this.elements.resultsSection.classList.remove('hidden');
    },

    // --- Acciones de PDF ---

    async openPreview(index) {
        const booklet = window.generatedBooklets[index];
        if (!booklet) return;

        this.elements.previewTitle.textContent = `Cuadernillo ${index + 1} (Previsualización)`;
        this.elements.previewModal.classList.remove('hidden');

        const arrayBuffer = await booklet.blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        this.currentPreviewPdf = await loadingTask.promise;
        this.currentPreviewPage = 1;
        this.elements.totalPreviewPagesSpan.textContent = this.currentPreviewPdf.numPages;

        this.renderPreviewPage();
    },

    async renderPreviewPage() {
        if (!this.currentPreviewPdf) return;

        const page = await this.currentPreviewPdf.getPage(this.currentPreviewPage);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = this.elements.previewCanvas;
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        this.elements.currentPageSpan.textContent = this.currentPreviewPage;
    },

    changePreviewPage(delta) {
        if (!this.currentPreviewPdf) return;
        const newPage = this.currentPreviewPage + delta;
        if (newPage >= 1 && newPage <= this.currentPreviewPdf.numPages) {
            this.currentPreviewPage = newPage;
            this.renderPreviewPage();
        }
    },

    closePreview() {
        this.elements.previewModal.classList.add('hidden');
        this.currentPreviewPdf = null;
    },

    async printPDF(index) {
        const booklet = window.generatedBooklets[index];
        if (!booklet) return;

        this.setStatus("Enviando a impresora...");
        try {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                if (window.AndroidPrint && window.AndroidPrint.printPdf) {
                    window.AndroidPrint.printPdf(base64);
                } else {
                    // Fallback para navegador
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = booklet.url;
                    document.body.appendChild(iframe);
                    iframe.onload = () => {
                        iframe.contentWindow.print();
                        setTimeout(() => document.body.removeChild(iframe), 1000);
                    };
                }
                this.hideStatus();
            };
            reader.readAsDataURL(booklet.blob);
        } catch (e) {
            this.setStatus("Error al imprimir: " + e.message, true);
        }
    },

    async sharePDF(index) {
        const booklet = window.generatedBooklets[index];
        if (!booklet) return;

        const file = new File([booklet.blob], `cuadernillo_${index + 1}.pdf`, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Cuadernillo PDF',
                    text: 'Cuadernillo generado con la app Cuadernillos'
                });
            } catch (err) {
                console.error("Error al compartir:", err);
            }
        } else {
            this.setStatus("Tu dispositivo no soporta la función nativa de compartir archivos.");
        }
    },

    savePDF(index) {
        const booklet = window.generatedBooklets[index];
        if (!booklet) return;

        const a = document.createElement('a');
        a.href = booklet.url;
        a.download = `cuadernillo_${index + 1}.pdf`;
        a.click();
    },

    reset() {
        this.elements.pdfInput.value = '';
        this.elements.fileInfo.classList.add('hidden');
        this.elements.resultsSection.classList.add('hidden');
        this.elements.processBtn.disabled = true;
        this.hideStatus();
    }
};
UIManager.init();
