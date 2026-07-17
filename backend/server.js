const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Member-Id']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== MONGODB CONNECTION =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym_management';

console.log('📡 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI)
.then(() => {
  console.log('✅ Connected to Lion Muscles Gym Database');
  initializeManager();
})
.catch(err => {
  console.error('❌ MongoDB Connection Error:', err.message);
  console.log('⚠️  Please check your MONGODB_URI in .env file');
});

// ===== MODELS =====
const memberSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  subscriptionType: { type: String, enum: ['monthly', 'yearly'], required: true },
  joinDate: { type: Date, default: Date.now },
  lastPaymentDate: { type: Date, required: true },
  nextPaymentDate: { type: Date, required: true },
  isPaid: { type: Boolean, default: false },
  paymentHistory: [{
    date: { type: Date, default: Date.now },
    amount: { type: Number },
    subscriptionType: { type: String }
  }],
  notifications: [{
    message: { type: String },
    date: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
  }]
}, { timestamps: true });

const managerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true }
});

const Member = mongoose.model('Member', memberSchema);
const Manager = mongoose.model('Manager', managerSchema);

// ===== INITIALIZE MANAGER =====
const initializeManager = async () => {
  try {
    const managerExists = await Manager.findOne({ username: 'manager' });
    if (!managerExists) {
      const manager = new Manager({
        username: 'manager',
        password: 'manager123',
        name: 'Gym Manager',
        email: 'manager@lionmuscles.com'
      });
      await manager.save();
      console.log('✅ Default manager created: manager/manager123');
    } else {
      console.log('✅ Manager already exists');
    }
  } catch (error) {
    console.error('Error creating manager:', error);
  }
};

// ===== AUTH MIDDLEWARE =====
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  if (token === 'manager-token' || token === 'member-token') {
    req.userType = token === 'manager-token' ? 'manager' : 'member';
    next();
  } else {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ===== ROUTES =====
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Lion Muscles Gym API Running', 
    message: 'Welcome to Lion Muscles Gym',
    version: '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password, role } = req.body;
  
  try {
    if (role === 'manager') {
      const manager = await Manager.findOne({ username });
      if (manager && password === manager.password) {
        return res.json({ 
          success: true, 
          token: 'manager-token',
          role: 'manager',
          managerId: manager._id,
          managerName: manager.name,
          message: 'Manager login successful!'
        });
      }
      return res.status(401).json({ error: 'Invalid manager credentials' });
    } else if (role === 'member') {
      const member = await Member.findOne({ username });
      if (!member) {
        return res.status(401).json({ error: 'Member not found' });
      }
      if (password !== member.password) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      return res.json({
        success: true,
        token: 'member-token',
        role: 'member',
        memberId: member._id,
        memberName: member.name,
        message: 'Welcome back, ' + member.name + '!'
      });
    }
    res.status(400).json({ error: 'Invalid role' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/members/register', async (req, res) => {
  try {
    const { username, password, name, email, phone, address, subscriptionType, joinDate } = req.body;
    
    if (!username || !password || !name || !email || !phone || !address || !subscriptionType) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUsername = await Member.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const existingEmail = await Member.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const join = new Date(joinDate || Date.now());
    const lastPaymentDate = new Date(join);
    const nextPaymentDate = new Date(join);
    
    if (subscriptionType === 'monthly') {
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    } else {
      nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
    }

    const member = new Member({
      username,
      password,
      name,
      email,
      phone,
      address,
      subscriptionType,
      joinDate: join,
      lastPaymentDate: join,
      nextPaymentDate,
      isPaid: false,
      paymentHistory: [{
        date: join,
        amount: subscriptionType === 'monthly' ? 50 : 500,
        subscriptionType
      }]
    });

    await member.save();
    res.status(201).json({ 
      success: true, 
      message: 'Registration successful! You can now login.',
      member: {
        username: member.username,
        name: member.name,
        email: member.email,
        phone: member.phone,
        address: member.address
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/members', authMiddleware, async (req, res) => {
  try {
    if (req.userType !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Only managers can view all members.' });
    }
    
    const members = await Member.find().sort({ createdAt: -1 });
    
    const membersWithDetails = members.map(member => {
      const now = new Date();
      const nextPayment = new Date(member.nextPaymentDate);
      const daysLeft = Math.ceil((nextPayment - now) / (1000 * 60 * 60 * 24));
      const isOverdue = daysLeft < 0;
      
      return {
        _id: member._id,
        username: member.username,
        name: member.name,
        email: member.email,
        phone: member.phone,
        address: member.address,
        subscriptionType: member.subscriptionType,
        joinDate: member.joinDate,
        lastPaymentDate: member.lastPaymentDate,
        nextPaymentDate: member.nextPaymentDate,
        isPaid: member.isPaid,
        daysLeft: daysLeft,
        isOverdue: isOverdue,
        paymentStatus: member.isPaid ? 'paid' : (isOverdue ? 'overdue' : 'pending'),
        paymentHistory: member.paymentHistory,
        notifications: member.notifications
      };
    });
    
    res.json(membersWithDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/members/:id', authMiddleware, async (req, res) => {
  try {
    if (req.userType === 'member') {
      const memberId = req.headers['x-member-id'];
      if (memberId !== req.params.id) {
        return res.status(403).json({ error: 'Access denied. You can only view your own profile.' });
      }
    }
    
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const now = new Date();
    const nextPayment = new Date(member.nextPaymentDate);
    const daysLeft = Math.ceil((nextPayment - now) / (1000 * 60 * 60 * 24));
    
    res.json({
      ...member.toObject(),
      daysLeft,
      isOverdue: daysLeft < 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/members/:id/pay', authMiddleware, async (req, res) => {
  try {
    if (req.userType !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Only managers can mark payments.' });
    }
    
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    member.isPaid = true;
    member.lastPaymentDate = new Date();
    
    const nextPayment = new Date();
    if (member.subscriptionType === 'monthly') {
      nextPayment.setMonth(nextPayment.getMonth() + 1);
    } else {
      nextPayment.setFullYear(nextPayment.getFullYear() + 1);
    }
    member.nextPaymentDate = nextPayment;

    member.paymentHistory.push({
      date: new Date(),
      amount: member.subscriptionType === 'monthly' ? 50 : 500,
      subscriptionType: member.subscriptionType
    });

    await member.save();
    res.json({ 
      success: true, 
      message: 'Payment marked as paid!',
      member
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/members/:id/notify', authMiddleware, async (req, res) => {
  try {
    if (req.userType !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Only managers can send notifications.' });
    }
    
    const { message } = req.body;
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const notificationMessage = message || 'Payment reminder: Your subscription is due on ' + new Date(member.nextPaymentDate).toLocaleDateString();
    
    member.notifications.push({
      message: notificationMessage,
      date: new Date(),
      read: false
    });

    await member.save();
    res.json({ 
      success: true, 
      message: 'Notification sent successfully!',
      notification: member.notifications[member.notifications.length - 1]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/members/overdue', authMiddleware, async (req, res) => {
  try {
    if (req.userType !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Only managers can view overdue members.' });
    }
    
    const members = await Member.find();
    const overdue = members.filter(member => {
      const now = new Date();
      const nextPayment = new Date(member.nextPaymentDate);
      return nextPayment < now && !member.isPaid;
    });
    res.json(overdue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    if (req.userType !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Only managers can view statistics.' });
    }
    
    const totalMembers = await Member.countDocuments();
    const paidMembers = await Member.countDocuments({ isPaid: true });
    const overdueMembers = await Member.countDocuments({ 
      isPaid: false,
      nextPaymentDate: { $lt: new Date() }
    });
    const yearlyMembers = await Member.countDocuments({ subscriptionType: 'yearly' });
    const monthlyMembers = await Member.countDocuments({ subscriptionType: 'monthly' });
    
    res.json({
      totalMembers,
      paidMembers,
      overdueMembers,
      yearlyMembers,
      monthlyMembers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE MEMBER (Manager only) =====
app.delete('/api/members/:id', authMiddleware, async (req, res) => {
  try {
    // Check if user is manager
    if (req.userType !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Only managers can delete members.' });
    }
    
    const memberId = req.params.id;
    
    // Find and delete the member
    const deletedMember = await Member.findByIdAndDelete(memberId);
    
    if (!deletedMember) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    res.json({ 
      success: true, 
      message: `Member ${deletedMember.name} has been deleted successfully!`,
      member: deletedMember
    });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== START SERVER =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦁 Lion Muscles Gym System running on port ${PORT}`);
  console.log(`🔑 Manager Login: manager / manager123`);
});