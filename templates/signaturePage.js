// ============================================
// PAGE SIGNATURE CLIENT - Web accessible
// Le client peut voir le devis et signer
// ============================================

function getStatusLabel(statut) {
  switch (statut) {
    case 'brouillon': return '📝 Brouillon';
    case 'envoye': return '📤 En attente de signature';
    case 'vu': return '👁️ Consulté';
    case 'signe': return '✅ Signé';
    case 'refuse': return '❌ Refusé';
    case 'facture': return '💰 Facturé';
    default: return statut;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function formatPrice(price) {
  return parseFloat(price || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' €';
}

function generateLignesHTML(lignes) {
  if (!lignes || !Array.isArray(lignes)) return '';
  
  return lignes.map(ligne => {
    const qte = parseFloat(ligne.quantite) || 0;
    const pu = parseFloat(ligne.prix_unitaire) || 0;
    const total = qte * pu;
    
    return `
      <tr>
        <td>${ligne.description}</td>
        <td>${qte}</td>
        <td>${pu.toFixed(2)} €</td>
        <td>${ligne.tva_taux}%</td>
        <td><strong>${total.toFixed(2)} €</strong></td>
      </tr>
    `;
  }).join('');
}

const signaturePageHTML = (devis, entreprise) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Devis ${devis.numero} - Signature</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #0066FF 0%, #0052CC 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    
    .logo {
      max-width: 180px;
      max-height: 60px;
      margin-bottom: 15px;
    }
    
    .company-name {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    
    .devis-number {
      font-size: 18px;
      opacity: 0.9;
    }
    
    .content {
      padding: 30px;
    }
    
    .status-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    
    .status-envoye, .status-vu { background: #E3F2FD; color: #1976D2; }
    .status-signe { background: #E8F5E9; color: #388E3C; }
    .status-refuse { background: #FFEBEE; color: #D32F2F; }
    
    .section {
      margin-bottom: 30px;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #333;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #f0f0f0;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    
    @media (max-width: 600px) {
      .info-grid { grid-template-columns: 1fr; }
    }
    
    .info-box {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
    }
    
    .info-label {
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .info-value {
      font-size: 15px;
      color: #333;
      line-height: 1.6;
    }
    
    .info-name {
      font-weight: 600;
      font-size: 17px;
      margin-bottom: 5px;
    }
    
    .prestations-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    
    .prestations-table th {
      background: #0066FF;
      color: white;
      padding: 12px;
      text-align: left;
      font-size: 13px;
      font-weight: 600;
    }
    
    .prestations-table th:nth-child(2),
    .prestations-table th:nth-child(4) { text-align: center; }
    
    .prestations-table th:nth-child(3),
    .prestations-table th:nth-child(5) { text-align: right; }
    
    .prestations-table td {
      padding: 15px 12px;
      border-bottom: 1px solid #eee;
      font-size: 14px;
    }
    
    .prestations-table td:nth-child(2),
    .prestations-table td:nth-child(4) { text-align: center; }
    
    .prestations-table td:nth-child(3),
    .prestations-table td:nth-child(5) { text-align: right; }
    
    .prestations-table tr:hover { background: #f8f9fa; }
    
    .totals {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      margin-left: auto;
      max-width: 300px;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 15px;
    }
    
    .total-row.final {
      border-top: 2px solid #0066FF;
      margin-top: 10px;
      padding-top: 15px;
      font-size: 20px;
      font-weight: 700;
      color: #0066FF;
    }
    
    .conditions {
      background: #fff8e1;
      border-left: 4px solid #ffc107;
      padding: 15px 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 30px;
    }
    
    .conditions-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
    }
    
    .conditions-text {
      font-size: 13px;
      color: #666;
      line-height: 1.6;
    }
    
    .signature-section {
      border: 2px dashed #ddd;
      border-radius: 12px;
      padding: 25px;
      text-align: center;
    }
    
    .signature-section.signed {
      border-color: #4CAF50;
      background: #E8F5E9;
    }
    
    .signature-section.refused {
      border-color: #f44336;
      background: #FFEBEE;
    }
    
    .signature-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #333;
    }
    
    .signature-canvas-container {
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      margin-bottom: 15px;
      position: relative;
    }
    
    #signatureCanvas {
      width: 100%;
      height: 200px;
      cursor: crosshair;
      touch-action: none;
    }
    
    .signature-image {
      max-width: 100%;
      max-height: 150px;
      margin: 20px 0;
    }
    
    .signature-info {
      font-size: 13px;
      color: #666;
      margin-top: 10px;
    }
    
    .btn-group {
      display: flex;
      gap: 15px;
      margin-top: 20px;
      flex-wrap: wrap;
      justify-content: center;
    }
    
    .btn {
      padding: 14px 30px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
      color: white;
    }
    
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(76, 175, 80, 0.4);
    }
    
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    
    .btn-secondary:hover:not(:disabled) {
      background: #e0e0e0;
    }
    
    .btn-danger {
      background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
      color: white;
    }
    
    .btn-danger:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(244, 67, 54, 0.4);
    }
    
    .name-input {
      width: 100%;
      max-width: 300px;
      padding: 12px 16px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      margin-bottom: 15px;
      text-align: center;
    }
    
    .name-input:focus {
      outline: none;
      border-color: #0066FF;
    }
    
    .message {
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-weight: 500;
    }
    
    .message-success {
      background: #E8F5E9;
      color: #2E7D32;
      border: 1px solid #A5D6A7;
    }
    
    .message-error {
      background: #FFEBEE;
      color: #C62828;
      border: 1px solid #EF9A9A;
    }
    
    .footer {
      text-align: center;
      padding: 20px;
      background: #f8f9fa;
      font-size: 12px;
      color: #666;
    }
    
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid #fff;
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 1s linear infinite;
      margin-right: 10px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${entreprise && entreprise.logo_url ? `<img src="${entreprise.logo_url}" class="logo" alt="Logo">` : ''}
      <div class="company-name">${entreprise ? entreprise.nom : 'Entreprise'}</div>
      <div class="devis-number">Devis ${devis.numero}</div>
    </div>
    
    <div class="content">
      <div id="messageContainer"></div>
      
      <span class="status-badge status-${devis.statut}" id="statusBadge">
        ${getStatusLabel(devis.statut)}
      </span>
      
      <div class="section">
        <div class="section-title">📋 Informations</div>
        <div class="info-grid">
          <div class="info-box">
            <div class="info-label">Client</div>
            <div class="info-value">
              <div class="info-name">${devis.client_nom || ''} ${devis.client_prenom || ''}</div>
              ${devis.client_adresse || ''}<br>
              ${devis.client_cp || ''} ${devis.client_ville || ''}
            </div>
          </div>
          <div class="info-box">
            <div class="info-label">Détails</div>
            <div class="info-value">
              <strong>Date:</strong> ${formatDate(devis.created_at)}<br>
              <strong>Validité:</strong> ${formatDate(devis.date_validite)}
            </div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">📝 Prestations</div>
        <table class="prestations-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qté</th>
              <th>Prix unit. HT</th>
              <th>TVA</th>
              <th>Total HT</th>
            </tr>
          </thead>
          <tbody>
            ${generateLignesHTML(devis.lignes)}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="total-row">
            <span>Total HT</span>
            <span>${formatPrice(devis.total_ht)}</span>
          </div>
          <div class="total-row">
            <span>TVA</span>
            <span>${formatPrice(devis.total_tva)}</span>
          </div>
          <div class="total-row final">
            <span>Total TTC</span>
            <span>${formatPrice(devis.total_ttc)}</span>
          </div>
        </div>
      </div>
      
      <div class="conditions">
        <div class="conditions-title">📌 Conditions</div>
        <div class="conditions-text">
          ${entreprise && entreprise.conditions_devis ? entreprise.conditions_devis : 'Devis valable 30 jours.'}<br>
          ${entreprise && entreprise.mention_legale ? entreprise.mention_legale : ''}
        </div>
      </div>
      
      <div class="signature-section ${devis.statut === 'signe' ? 'signed' : devis.statut === 'refuse' ? 'refused' : ''}" id="signatureSection">
        ${devis.statut === 'signe' ? `
          <div class="signature-title">✅ Devis signé</div>
          ${devis.signature_data ? `<img src="${devis.signature_data}" class="signature-image" alt="Signature">` : ''}
          <div class="signature-info">
            Signé le ${formatDate(devis.signe_le)} par ${devis.signe_par || 'Client'}
          </div>
        ` : devis.statut === 'refuse' ? `
          <div class="signature-title">❌ Devis refusé</div>
          <div class="signature-info">
            ${devis.notes || 'Le client a refusé ce devis.'}
          </div>
        ` : `
          <div class="signature-title">✍️ Signature</div>
          <p style="color: #666; margin-bottom: 15px;">
            En signant ce devis, vous acceptez les conditions ci-dessus.
          </p>
          
          <input type="text" class="name-input" id="signerName" placeholder="Votre nom complet" required>
          
          <div class="signature-canvas-container">
            <canvas id="signatureCanvas"></canvas>
          </div>
          
          <div class="btn-group">
            <button class="btn btn-secondary" onclick="clearSignature()">Effacer</button>
            <button class="btn btn-primary" onclick="submitSignature()" id="btnSign">
              ✅ Signer le devis
            </button>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #666; margin-bottom: 15px;">Vous ne souhaitez pas accepter ce devis ?</p>
            <button class="btn btn-danger" onclick="refuseDevis()" id="btnRefuse">
              ❌ Refuser le devis
            </button>
          </div>
        `}
      </div>
    </div>
    
    <div class="footer">
      ${entreprise ? entreprise.nom : ''} - SIRET: ${entreprise ? entreprise.siret : ''}<br>
      ${entreprise ? entreprise.telephone : ''} | ${entreprise ? entreprise.email : ''}
    </div>
  </div>
  
  <script>
    const devisId = '${devis.id}';
    let canvas, ctx, isDrawing = false, lastX = 0, lastY = 0;
    
    document.addEventListener('DOMContentLoaded', function() {
      canvas = document.getElementById('signatureCanvas');
      if (!canvas) return;
      
      ctx = canvas.getContext('2d');
      
      const container = canvas.parentElement;
      canvas.width = container.offsetWidth - 2;
      canvas.height = 200;
      
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseout', stopDrawing);
      
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', stopDrawing);
    });
    
    function startDrawing(e) {
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
    }
    
    function draw(e) {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      
      lastX = x;
      lastY = y;
    }
    
    function handleTouchStart(e) {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      lastX = touch.clientX - rect.left;
      lastY = touch.clientY - rect.top;
      isDrawing = true;
    }
    
    function handleTouchMove(e) {
      e.preventDefault();
      if (!isDrawing) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      
      lastX = x;
      lastY = y;
    }
    
    function stopDrawing() {
      isDrawing = false;
    }
    
    function clearSignature() {
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    
    function isCanvasEmpty() {
      const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixelData.length; i += 4) {
        if (pixelData[i] !== 0) return false;
      }
      return true;
    }
    
    function showMessage(text, type) {
      const container = document.getElementById('messageContainer');
      container.innerHTML = '<div class="message message-' + type + '">' + text + '</div>';
      container.scrollIntoView({ behavior: 'smooth' });
    }
    
    async function submitSignature() {
      const signerName = document.getElementById('signerName').value.trim();
      
      if (!signerName) {
        showMessage('Veuillez entrer votre nom', 'error');
        return;
      }
      
      if (isCanvasEmpty()) {
        showMessage('Veuillez signer dans le cadre', 'error');
        return;
      }
      
      const btn = document.getElementById('btnSign');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading"></span>Signature en cours...';
      
      try {
        const signatureData = canvas.toDataURL('image/png');
        
        const response = await fetch('/api/devis/' + devisId + '/signer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature_data: signatureData,
            signe_par: signerName
          })
        });
        
        if (!response.ok) throw new Error('Erreur');
        
        showMessage('✅ Devis signé avec succès ! Merci pour votre confiance.', 'success');
        setTimeout(() => location.reload(), 2000);
        
      } catch (error) {
        showMessage('Erreur lors de la signature. Veuillez réessayer.', 'error');
        btn.disabled = false;
        btn.innerHTML = '✅ Signer le devis';
      }
    }
    
    async function refuseDevis() {
      const motif = prompt('Motif du refus (optionnel):');
      
      const btn = document.getElementById('btnRefuse');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading"></span>En cours...';
      
      try {
        const response = await fetch('/api/devis/' + devisId + '/refuser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motif })
        });
        
        if (!response.ok) throw new Error('Erreur');
        
        showMessage('Le devis a été refusé.', 'success');
        setTimeout(() => location.reload(), 2000);
        
      } catch (error) {
        showMessage('Erreur. Veuillez réessayer.', 'error');
        btn.disabled = false;
        btn.innerHTML = '❌ Refuser le devis';
      }
    }
  </script>
</body>
</html>
`;

module.exports = { signaturePageHTML };
