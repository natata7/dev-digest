import type { FastifyRequest } from 'fastify';
import type { PrLabelRepository } from './repository';

export class PrLabelService {
  constructor(private readonly repo: PrLabelRepository) {}

  list(workspaceId: string, prId: string) {
    return this.repo.forPull(workspaceId, prId);
  }

  async add(req: FastifyRequest, prId: string, name: string) {
    const label = {
      prId,
      name: name.trim().toLowerCase(),
      createdBy: req.userId,
    };
    return this.repo.insert(req.workspaceId, label);
  }
}
