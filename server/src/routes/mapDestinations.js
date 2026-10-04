import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import { makeCrud } from '../controllers/crudFactory.js';
import MapDestination from '../models/MapDestination.js';

// Same shape as resourceRouter, but also gated by the owner's per-person
// "maps" sharing toggle so a circle member only sees destinations if it
// was shared with them.
const router = Router();
const crud = makeCrud(MapDestination, { sortBy: '-updatedAt' });

router.use(requireAuth, resolveViewer, requireModuleShared('maps'));
router.get('/', crud.list);
router.post('/', requireOwnWrite, crud.create);
router.put('/:id', requireOwnWrite, crud.update);
router.delete('/:id', requireOwnWrite, crud.remove);

export default router;
