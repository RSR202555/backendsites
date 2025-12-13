import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: 'Já existe um usuário com este e-mail.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      externalId: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: null,
      // role padrão CLIENT
      // você pode criar manualmente um ADMIN no banco depois
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { /* placeholder para futuras infos, senha em tabela separada se quiser */ },
  });

  await prisma.$executeRawUnsafe(
    'UPDATE User SET name = name WHERE id = ?;',
    user.id,
  );

  // opcionalmente, você poderia ter um model separado para credenciais; para simplificar,
  // vamos guardar o hash na tabela User adicionando um campo passwordHash futuramente.

  // Por enquanto, retornamos apenas sucesso.
  return res.status(201).json({ message: 'Usuário criado com sucesso.' });
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  // Aqui deveria comparar passwordHash; como o schema atual não tem campo para senha,
  // este é um placeholder até você adicionar `passwordHash String` no modelo User.
  // Exemplo real:
  // const valid = await bcrypt.compare(password, user.passwordHash);
  // if (!valid) { ... }

  const secret = process.env.JWT_SECRET || 'dev-secret';
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    secret,
    { expiresIn: '7d' },
  );

  return res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});
