export const storeConfig = {
  name: 'Norlei Salgados',
  description: 'Os melhores salgados de Guarujá! Feitos com muito amor e qualidade.',

  categories: [
    { id: 'salgados-fritos', name: 'Salgados Fritos', emoji: '🔥', icon: '🔥', description: 'Coxinhas, pastéis, bolinhos e mais' },
    { id: 'salgados-congelados', name: 'Salgados Congelados', emoji: '❄️', icon: '❄️', description: 'Prontos para fritar em casa' },
    { id: 'empadas', name: 'Empadas', emoji: '🥧', icon: '🥧', description: 'Empadas variadas no capricho' },
    { id: 'encomendas', name: 'Encomendas', emoji: '📦', icon: '📦', description: 'Festas, eventos e quantidades especiais' }
  ],

  contact: {
    whatsapp: '5511943833418',
    email: '',
    instagram: '',
    address: 'Guarujá - SP'
  },

  shipping: {
    freeCity: 'Guarujá',
    freeState: 'SP',
    freeShippingMessage: 'Entrega disponível em Guarujá - SP',
    deliveryFee: 5.00
  },

  payment: {
    pix: true,
    pixDiscount: 5,
    creditCard: true,
    debitCard: true,
    cash: true
  },

  aiPersonality: {
    name: 'Norlei',
    tone: 'simpática, animada e atenciosa',
    specialty: 'salgados artesanais feitos na hora',
    greeting: 'Olá! Bem-vindo à Norlei Salgados! 🥟'
  }
};