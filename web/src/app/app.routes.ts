import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./invoices/invoices-page').then((m) => m.InvoicesPage),
    title: 'Notas · Descarga CD',
  },
  {
    path: 'lojas',
    loadComponent: () => import('./stores/stores-page').then((m) => m.StoresPage),
    title: 'Lojas · Descarga CD',
  },
  {
    path: 'produtos',
    loadComponent: () => import('./products/products-page').then((m) => m.ProductsPage),
    title: 'Produtos · Descarga CD',
  },
  { path: '**', redirectTo: '' },
];
