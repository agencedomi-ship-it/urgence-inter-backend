// ============================================
// BACKEND SERVER - URGENCE INTER
// Express + Socket.io + Supabase + Push Notifications
// ============================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// ============================================
// CONFIGURATION
// ============================================

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre-secret-jwt-super-secure-2024';

// Supabase
const SUPABASE_URL = 'https://ppmjcjaoyqqfyskejsni.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwbWpjamFveXFxZnlza2Vqc25pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0OTYzNzIsImV4cCI6MjA4MTA3MjM3Mn0.2dSLW3W8-FzNMp8tIP3ZYQLpnp0eem5CrXHACXcwp7Y';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuration Multer pour upload photos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'), false);
    }
  }
});

// ============================================
// PUSH NOTIFICATIONS - EXPO
// ============================================

const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) {
    return false;
  }

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
      }),
    });
    return true;
  } catch (error) {
    console.error('❌ Erreur push:', error);
    return false;
  }
};

const sendPushToMultiple = async (pushTokens, title, body, data = {}) => {
  const messages = pushTokens
    .filter(token => token && token.startsWith('ExponentPushToken'))
    .map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
    }));

  if (messages.length === 0) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.error('❌ Erreur push multiple:', error);
  }
};

const getAdminPushTokens = async () => {
  const { data } = await supabase
    .from('techs')
    .select('push_token')
    .in('role', ['Admin', 'Teleop', 'admin', 'teleop'])
    .not('push_token', 'is', null);
  
  return (data || []).map(t => t.push_token).filter(Boolean);
};

const getTechPushToken = async (techId) => {
  const { data } = await supabase
    .from('techs')
    .select('push_token')
    .eq('id', techId)
    .single();
  
  return data?.push_token;
};

// Middleware d'authentification
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
}

// ============================================
// AUTHENTIFICATION
// ============================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { nom, mdp } = req.body;

    const { data: user, error } = await supabase
      .from('techs')
      .select('*')
      .eq('nom', nom)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    let validPassword = false;
    if (user.mdp.startsWith('$2')) {
      validPassword = await bcrypt.compare(mdp, user.mdp);
    } else {
      validPassword = mdp === user.mdp;
      if (validPassword) {
        const hashedMdp = await bcrypt.hash(mdp, 10);
        await supabase.from('techs').update({ mdp: hashedMdp }).eq('id', user.id);
      }
    }

    if (!validPassword) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    const token = jwt.sign(
      { id: user.id, nom: user.nom, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await supabase.from('techs').update({ 
      en_ligne: true,
      derniere_connexion: new Date().toISOString()
    }).eq('id', user.id);

    const { mdp: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/push-token', authenticateToken, async (req, res) => {
  try {
    const { pushToken } = req.body;
    await supabase.from('techs').update({ push_token: pushToken }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    await supabase.from('techs').update({ en_ligne: false }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('techs')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const { mdp: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// TECHNICIENS API
// ============================================

app.get('/api/techs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('techs')
      .select('id, nom, prenom, email, telephone, role, departements, en_ligne, en_pause, latitude, longitude, derniere_connexion, pourcentage_tech')
      .order('nom');

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/techs', async (req, res) => {
  try {
    const { nom, prenom, email, telephone, mdp, role, departements, pourcentage_tech } = req.body;

    if (!nom || !mdp) {
      return res.status(400).json({ error: 'Nom et mot de passe requis' });
    }

    const { data: existing } = await supabase.from('techs').select('id').eq('nom', nom).single();
    if (existing) {
      return res.status(400).json({ error: 'Ce nom existe déjà' });
    }

    const hashedMdp = await bcrypt.hash(mdp, 10);

    const { data, error } = await supabase
      .from('techs')
      .insert([{
        nom,
        prenom: prenom || null,
        email: email || null,
        telephone: telephone || null,
        mdp: hashedMdp,
        role: role || 'technicien',
        departements: departements || [],
        pourcentage_tech: pourcentage_tech || 50,
        en_ligne: false,
        actif: true,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.put('/api/techs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updated_at: new Date().toISOString() };

    if (req.body.mdp && req.body.mdp.trim()) {
      updateData.mdp = await bcrypt.hash(req.body.mdp, 10);
    } else {
      delete updateData.mdp;
    }

    const { data, error } = await supabase
      .from('techs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/techs/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('techs').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/techs/:id/position', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const { data, error } = await supabase
      .from('techs')
      .update({ latitude, longitude, derniere_position: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    io.emit('tech:positionUpdate', { techId: req.params.id, latitude, longitude });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/techs/:id/status', async (req, res) => {
  try {
    const { en_ligne } = req.body;
    const { data, error } = await supabase
      .from('techs')
      .update({ en_ligne })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    io.emit('tech:statusUpdate', { techId: req.params.id, enLigne: en_ligne });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/techs/:id/pause', async (req, res) => {
  try {
    const { en_pause } = req.body;
    const { data, error } = await supabase
      .from('techs')
      .update({ en_pause })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    io.emit('tech:pauseUpdate', { techId: req.params.id, enPause: en_pause });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// INTERVENTIONS API
// ============================================

app.get('/api/interventions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('interventions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/interventions/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('interventions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/interventions', async (req, res) => {
  try {
    const interventionData = { ...req.body };
    if (!interventionData.id || interventionData.id === '') delete interventionData.id;
    if (!interventionData.tech_id || interventionData.tech_id === '') delete interventionData.tech_id;

    const { data, error } = await supabase
      .from('interventions')
      .insert([interventionData])
      .select()
      .single();

    if (error) throw error;
    io.emit('intervention:created', data);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.put('/api/interventions/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('interventions')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    io.emit('intervention:updated', data);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/interventions/:id/attribuer', async (req, res) => {
  try {
    const { tech_id, tech_nom, mode } = req.body;

    const updateData = {
      tech_nom: tech_nom,
      statut: 'Attribuée',
      mode_distribution: mode || 'direct',
      date_attribution: new Date().toISOString(),
    };

    if (tech_id && tech_id.length > 10) {
      updateData.tech_id = tech_id;
    }

    const { data, error } = await supabase
      .from('interventions')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (tech_id) {
      const techToken = await getTechPushToken(tech_id);
      if (techToken) {
        await sendPushNotification(
          techToken,
          'Nouvelle intervention',
          `${data.service} à ${data.cp} ${data.ville}`,
          { type: 'attribution', interventionId: data.id }
        );
      }
    }

    io.emit('intervention:updated', data);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/interventions/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('interventions').delete().eq('id', req.params.id);
    if (error) throw error;
    io.emit('intervention:deleted', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// DEVIS API
// ============================================

app.get('/api/devis', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devis')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/devis/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devis')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/devis', async (req, res) => {
  try {
    const devisData = { ...req.body };
    if (!devisData.id || devisData.id === '') delete devisData.id;

    const { data, error } = await supabase
      .from('devis')
      .insert([devisData])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.put('/api/devis/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devis')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/devis/:id/signer', async (req, res) => {
  try {
    const { signature_data, signe_par } = req.body;

    const { data, error } = await supabase
      .from('devis')
      .update({
        statut: 'signe',
        signature_data,
        signe_le: new Date().toISOString(),
        signe_par: signe_par || 'Client',
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/devis/:id/facturer', async (req, res) => {
  try {
    const { data: devis, error: devisError } = await supabase
      .from('devis')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (devisError) throw devisError;

    const factureData = {
      devis_id: devis.id,
      intervention_id: devis.intervention_id,
      client_nom: devis.client_nom,
      client_prenom: devis.client_prenom,
      client_email: devis.client_email,
      client_tel: devis.client_tel,
      client_adresse: devis.client_adresse,
      client_cp: devis.client_cp,
      client_ville: devis.client_ville,
      lignes: devis.lignes,
      total_ht: devis.total_ht,
      total_tva: devis.total_tva,
      total_ttc: devis.total_ttc,
    };

    const { data: facture, error: factureError } = await supabase
      .from('factures')
      .insert([factureData])
      .select()
      .single();

    if (factureError) throw factureError;

    await supabase.from('devis').update({ statut: 'facture' }).eq('id', req.params.id);

    res.status(201).json(facture);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/devis/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('devis').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// FACTURES API
// ============================================

app.get('/api/factures', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('factures')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/factures/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('factures')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/factures/:id/payer', async (req, res) => {
  try {
    const { mode_paiement, reference_paiement, montant_paye } = req.body;

    const { data, error } = await supabase
      .from('factures')
      .update({
        statut: 'payee',
        mode_paiement,
        reference_paiement,
        montant_paye: montant_paye || 0,
        payee_le: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ENTREPRISE CONFIG API
// ============================================

app.get('/api/entreprise', async (req, res) => {
  try {
    const { data, error } = await supabase.from('entreprise_config').select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/entreprise', async (req, res) => {
  try {
    const { data: existing } = await supabase.from('entreprise_config').select('id').single();
    const { data, error } = await supabase
      .from('entreprise_config')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// LIGNES TÉLÉPHONIQUES API
// ============================================

app.get('/api/lignes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('lignes').select('*').order('nom');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/lignes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('lignes').insert([req.body]).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/lignes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lignes')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/lignes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('lignes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// DÉPENSES PUBLICITAIRES API
// ============================================

app.get('/api/depenses-pub', async (req, res) => {
  try {
    const { ligne_id, date_debut, date_fin } = req.query;
    
    let query = supabase
      .from('depenses_pub')
      .select('*, lignes(nom, service)')
      .order('date', { ascending: false });

    if (ligne_id) query = query.eq('ligne_id', ligne_id);
    if (date_debut) query = query.gte('date', date_debut);
    if (date_fin) query = query.lte('date', date_fin);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/depenses-pub', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('depenses_pub')
      .insert([req.body])
      .select('*, lignes(nom, service)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/depenses-pub/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('depenses_pub')
      .update(req.body)
      .eq('id', req.params.id)
      .select('*, lignes(nom, service)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/depenses-pub/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('depenses_pub').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// COMPTES BANCAIRES API
// ============================================

app.get('/api/comptes-bancaires', async (req, res) => {
  try {
    const { data, error } = await supabase.from('comptes_bancaires').select('*').order('nom');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/comptes-bancaires', async (req, res) => {
  try {
    const { data, error } = await supabase.from('comptes_bancaires').insert([req.body]).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/comptes-bancaires/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('comptes_bancaires')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/comptes-bancaires/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('comptes_bancaires').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// STATS PUBLICITÉ API
// ============================================

app.get('/api/stats/pub', async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    
    let depensesQuery = supabase.from('depenses_pub').select('montant, date, ligne_id');
    if (date_debut) depensesQuery = depensesQuery.gte('date', date_debut);
    if (date_fin) depensesQuery = depensesQuery.lte('date', date_fin);
    const { data: depenses } = await depensesQuery;
    
    let interventionsQuery = supabase
      .from('interventions')
      .select('prix, created_at, ligne_id')
      .in('statut', ['Terminée', 'Terminé']);
    if (date_debut) interventionsQuery = interventionsQuery.gte('created_at', date_debut);
    if (date_fin) interventionsQuery = interventionsQuery.lte('created_at', date_fin);
    const { data: interventions } = await interventionsQuery;
    
    const { data: lignes } = await supabase.from('lignes').select('*');
    
    const statsByLigne = {};
    
    for (const ligne of lignes || []) {
      const ligneDepenses = (depenses || [])
        .filter(d => d.ligne_id === ligne.id)
        .reduce((sum, d) => sum + parseFloat(d.montant || 0), 0);
      
      const ligneCA = (interventions || [])
        .filter(i => i.ligne_id === ligne.id)
        .reduce((sum, i) => sum + parseFloat(i.prix || 0), 0);
      
      statsByLigne[ligne.id] = {
        ligne_id: ligne.id,
        ligne_nom: ligne.nom,
        service: ligne.service,
        depenses: ligneDepenses,
        ca: ligneCA,
        profit: ligneCA - ligneDepenses,
        rentable: ligneCA >= ligneDepenses,
      };
    }
    
    const totalDepenses = Object.values(statsByLigne).reduce((sum, s) => sum + s.depenses, 0);
    const totalCA = Object.values(statsByLigne).reduce((sum, s) => sum + s.ca, 0);
    
    res.json({
      par_ligne: Object.values(statsByLigne),
      totaux: {
        depenses: totalDepenses,
        ca: totalCA,
        profit: totalCA - totalDepenses,
        rentable: totalCA >= totalDepenses,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// UPLOAD PHOTOS
// ============================================

app.post('/api/upload/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucune photo fournie' });
    }

    const { interventionId, type } = req.body;
    const timestamp = Date.now();
    const filename = `interventions/${interventionId}/${type}_${timestamp}.jpg`;

    const { data, error } = await supabase.storage
      .from('photos')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filename);

    res.json({ success: true, url: urlData.publicUrl, filename: filename });
  } catch (error) {
    res.status(500).json({ error: 'Erreur upload', details: error.message });
  }
});

// ============================================
// SOCKET.IO
// ============================================

io.on('connection', (socket) => {
  console.log('🔌 Socket connecté:', socket.id);

  socket.on('join', (room) => {
    socket.join(room);
  });

  socket.on('leave', (room) => {
    socket.leave(room);
  });

  socket.on('tech:position', (data) => {
    io.emit('tech:positionUpdate', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket déconnecté:', socket.id);
  });
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

server.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`✅ Connecté à Supabase`);
});