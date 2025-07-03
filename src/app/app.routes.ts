import { Routes } from '@angular/router';
import { GamePage } from './game/game.page';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'game'
  },
  {
    path: 'game',
    component: GamePage
  }
];
