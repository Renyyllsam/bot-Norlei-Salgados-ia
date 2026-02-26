// ===== ELEMENTOS DO DOM =====
const productsGrid = document.getElementById('productsGrid');
const totalProducts = document.getElementById('totalProducts');
const newProductBtn = document.getElementById('newProductBtn');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');

const productModal = document.getElementById('productModal');
const deleteModal = document.getElementById('deleteModal');
const closeModal = document.getElementById('closeModal');
const closeDeleteModal = document.getElementById('closeDeleteModal');
const cancelBtn = document.getElementById('cancelBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

const productForm = document.getElementById('productForm');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveBtn');

const productId = document.getElementById('productId');
const productName = document.getElementById('productName');
const productPrice = document.getElementById('productPrice');
const productCategory = document.getElementById('productCategory');
const productStock = document.getElementById('productStock');
const productDescription = document.getElementById('productDescription');
const productSizes = document.getElementById('productSizes');
const productColors = document.getElementById('productColors');
const productImages = document.getElementById('productImages');

const existingImagesPreview = document.getElementById('existingImagesPreview');
const newImagesPreview = document.getElementById('newImagesPreview');
const loadingOverlay = document.getElementById('loadingOverlay');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const deleteProductName = document.getElementById('deleteProductName');

// ===== ESTADO =====
let products = [];
let editingProductId = null;
let deletingProductId = null;
let existingImages = [];

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadProducts();
    setupEventListeners();
});

// ===== AUTENTICAÇÃO =====
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        if (!data.authenticated) window.location.href = '/';
    } catch (error) { window.location.href = '/'; }
}

async function logout() {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
    window.location.href = '/';
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    newProductBtn.addEventListener('click', openNewProductModal);
    refreshBtn.addEventListener('click', loadProducts);
    logoutBtn.addEventListener('click', logout);
    closeModal.addEventListener('click', closeProductModal);
    cancelBtn.addEventListener('click', closeProductModal);
    closeDeleteModal.addEventListener('click', closeDeleteConfirmModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteConfirmModal);
    productForm.addEventListener('submit', saveProduct);
    confirmDeleteBtn.addEventListener('click', deleteProduct);
    productImages.addEventListener('change', previewNewImages);
    window.addEventListener('click', (e) => {
        if (e.target === productModal) closeProductModal();
        if (e.target === deleteModal) closeDeleteConfirmModal();
    });
}

// ===== CARREGAR PRODUTOS =====
async function loadProducts() {
    showLoading();
    try {
        const response = await fetch('/api/products');
        const data = await response.json();
        products = data.products || [];
        renderProducts();
        updateStats();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
    } finally {
        hideLoading();
    }
}

// ===== RENDERIZAR PRODUTOS =====
function renderProducts() {
    if (products.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">🥟</div>
                <h3>Nenhum produto cadastrado</h3>
                <p>Clique em "Novo Produto" para adicionar seu primeiro salgado</p>
            </div>`;
        return;
    }
    productsGrid.innerHTML = products.map(product => `
        <div class="product-card">
            ${product.images && product.images.length > 0
                ? `<img src="${product.images[0]}" alt="${product.name}" class="product-image">`
                : `<div class="product-image no-image">🥟</div>`
            }
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-price">R$ ${product.price.toFixed(2)}</div>
                <div class="product-details">
                    ${product.sizes && product.sizes.length > 0 ? `<div>📦 ${product.sizes.join(', ')}</div>` : ''}
                    ${product.colors && product.colors.length > 0 ? `<div>🍽️ ${product.colors.join(', ')}</div>` : ''}
                    <div style="margin-top: 8px;">
                        <span class="badge ${product.inStock ? 'badge-success' : 'badge-danger'}">
                            ${product.inStock ? 'Disponível' : 'Indisponível'}
                        </span>
                    </div>
                </div>
                <div class="product-actions">
                    <button class="btn btn-primary btn-small" onclick="openEditProductModal('${product.id}')">✏️ Editar</button>
                    <button class="btn btn-danger btn-small" onclick="openDeleteConfirmModal('${product.id}')">🗑️ Deletar</button>
                </div>
            </div>
        </div>
    `).join('');
}

function updateStats() {
    totalProducts.textContent = `${products.length} produto${products.length !== 1 ? 's' : ''}`;
}

// ===== MODAIS =====
function openNewProductModal() {
    editingProductId = null;
    existingImages = [];
    modalTitle.textContent = 'Novo Produto';
    productForm.reset();
    existingImagesPreview.innerHTML = '';
    newImagesPreview.innerHTML = '';
    productModal.classList.add('show');
}

function openEditProductModal(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    editingProductId = id;
    existingImages = product.images || [];
    modalTitle.textContent = 'Editar Produto';
    productId.value = product.id;
    productName.value = product.name;
    productPrice.value = product.price;
    productCategory.value = product.category;
    productStock.value = product.inStock ? 'true' : 'false';
    productDescription.value = product.description || '';
    productSizes.value = product.sizes ? product.sizes.join(', ') : '';
    productColors.value = product.colors ? product.colors.join(', ') : '';
    renderExistingImages(existingImages);
    newImagesPreview.innerHTML = '';
    productModal.classList.add('show');
}

function closeProductModal() {
    productModal.classList.remove('show');
    productForm.reset();
    existingImagesPreview.innerHTML = '';
    newImagesPreview.innerHTML = '';
    editingProductId = null;
    existingImages = [];
}

function openDeleteConfirmModal(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    deletingProductId = id;
    deleteProductName.textContent = product.name;
    deleteModal.classList.add('show');
}

function closeDeleteConfirmModal() {
    deleteModal.classList.remove('show');
    deletingProductId = null;
}

// ===== PREVIEW DE IMAGENS =====
function renderExistingImages(images) {
    if (!images || images.length === 0) { existingImagesPreview.innerHTML = ''; return; }
    existingImagesPreview.innerHTML = images.map((img, index) => `
        <div class="image-preview-item">
            <img src="${img}" alt="Imagem ${index + 1}">
            <button type="button" class="remove-image" onclick="removeExistingImage('${img}')">×</button>
        </div>
    `).join('');
}

function previewNewImages(e) {
    const files = Array.from(e.target.files);
    newImagesPreview.innerHTML = '';
    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'image-preview-item';
            div.innerHTML = `<img src="${e.target.result}" alt="Nova imagem ${index + 1}">`;
            newImagesPreview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function removeExistingImage(imageUrl) {
    existingImages = existingImages.filter(img => img !== imageUrl);
    renderExistingImages(existingImages);
}

// ===== SALVAR PRODUTO =====
async function saveProduct(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', productName.value);
    formData.append('price', productPrice.value);
    formData.append('category', productCategory.value);
    formData.append('inStock', productStock.value);
    formData.append('description', productDescription.value);
    formData.append('sizes', productSizes.value);
    formData.append('colors', productColors.value);
    const files = productImages.files;
    for (let i = 0; i < files.length; i++) formData.append('images', files[i]);
    if (editingProductId && existingImages.length > 0) formData.append('keepExistingImages', 'true');

    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
    try {
        const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
        const method = editingProductId ? 'PUT' : 'POST';
        const response = await fetch(url, { method, body: formData });
        const data = await response.json();
        if (response.ok) {
            showSuccess(editingProductId ? 'Produto atualizado!' : 'Produto criado!');
            closeProductModal();
            await loadProducts();
        } else {
            showError(data.error || 'Erro ao salvar produto');
        }
    } catch (error) {
        showError('Erro ao salvar produto');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Salvar';
    }
}

// ===== DELETAR PRODUTO =====
async function deleteProduct() {
    if (!deletingProductId) return;
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = 'Deletando...';
    try {
        const response = await fetch(`/api/products/${deletingProductId}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok) {
            showSuccess('Produto deletado!');
            closeDeleteConfirmModal();
            await loadProducts();
        } else {
            showError(data.error || 'Erro ao deletar produto');
        }
    } catch (error) {
        showError('Erro ao deletar produto');
    } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = '🗑️ Deletar';
    }
}

// ===== LOADING =====
function showLoading() { loadingOverlay.classList.add('show'); }
function hideLoading() { loadingOverlay.classList.remove('show'); }

// ===== NOTIFICAÇÕES =====
function showSuccess(message) { alert('✅ ' + message); }
function showError(message)   { alert('❌ Erro: ' + message); }