import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite } from '../middleware/auth.js';
import { makeCrud } from '../controllers/crudFactory.js';

// One router per ledger resource. GET is available to anyone allowed to
// view the book (self or accepted circle member); writes are owner-only.
export function resourceRouter(Model, opts) {
  const router = Router();
  const crud = makeCrud(Model, opts);

  router.use(requireAuth, resolveViewer);
  router.get('/', crud.list);
  router.post('/', requireOwnWrite, crud.create);
  router.put('/:id', requireOwnWrite, crud.update);
  router.delete('/:id', requireOwnWrite, crud.remove);

  return router;
}
