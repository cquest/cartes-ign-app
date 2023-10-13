// ce fichier doit disparaitre quand les classes LayerManager et MyAccount seront en place

import DOM from './dom';
import Globals from './globals';

function updateScrollAnchors() {
  Globals.maxScroll = (document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight);
  Globals.anchors = [0, Globals.maxScroll / 2.5, Globals.maxScroll];
  scrollTo(Globals.anchors[Globals.currentScrollIndex]);
}

function scrollTo(scrollValue) {
  Globals.ignoreNextScrollEvent = true;
  window.scroll({
    top: scrollValue,
    left: 0,
    behavior: 'smooth'
  });
}

// Ouverture/fermeture des fentres infos et légende
function openLegend(){
  // DOM.$defaultMenu.classList.add("d-none");
  DOM.$legendWindow.classList.remove("d-none");
  Globals.backButtonState = 'legend';
}

function closeLegend(){
  DOM.$legendWindow.classList.add("d-none");
  // DOM.$defaultMenu.classList.remove("d-none");
  openCat();
}

function openInfos(){
  // DOM.$defaultMenu.classList.add("d-none");
  DOM.$infoWindow.classList.remove("d-none");
  Globals.backButtonState = 'infos';
}

function closeInfos(){
  DOM.$infoWindow.classList.add("d-none");
  openCat();
}

// Ouverture/fermeture des écrans atlernatifs
function altScreenOn() {
  document.body.style.overflowY = "scroll";

  DOM.$rech.disabled = true;
  DOM.$rech.style.fontFamily = 'Open Sans Bold';
  DOM.$blueBg.classList.remove('d-none');

  DOM.$search.style.display = "none";
  DOM.$backTopLeftBtn.classList.remove('d-none');

  DOM.$altMenuContainer.classList.remove('d-none');
  Globals.lastTextInSearch = DOM.$rech.value;
  Globals.ignoreNextScrollEvent = true;
  window.scroll({
    top: 0,
    left: 0,
    behavior: 'auto'
  });
  Globals.currentScrollIndex = 0;
}

function altScreenOff() {
  document.body.style.overflowY = "auto";
  DOM.$rech.disabled = false;
  DOM.$rech.value = Globals.lastTextInSearch;
  DOM.$rech.removeAttribute('style');
  DOM.$blueBg.classList.add('d-none');

  DOM.$search.style.display = "flex";
  DOM.$backTopLeftBtn.classList.add('d-none');

  DOM.$parameterMenu.classList.add('d-none');
  DOM.$altMenuContainer.classList.add('d-none');
  // DOM.$defaultMenu.classList.remove("d-none");
  Globals.ignoreNextScrollEvent = true;
  window.scroll({
    top: 0,
    left: 0,
    behavior: 'auto'
  });
  Globals.currentScrollIndex = 0;
}

// Ouverture/fermeture de l'écran paramètres
function openParamsScreen() {
  altScreenOn();
  DOM.$parameterMenu.classList.remove('d-none');
  DOM.$rech.value = "Paramètres";
  Globals.backButtonState = 'params';
}

function closeParamsScreen() {
  altScreenOff();
  DOM.$parameterMenu.classList.add('d-none');
  Globals.backButtonState = 'default';
}

// Ouverture/fermeture de l'écran mentions légales
function openLegalScreen() {
  altScreenOn();
  DOM.$rech.value = "Mentions légales";
  DOM.$legalMenu.classList.remove('d-none');
  Globals.backButtonState = 'legal';
}

function closeLegalScreen(){
  altScreenOff();
  DOM.$legalMenu.classList.add('d-none');
  Globals.backButtonState = 'default';
}

// Ouverture/fermeture de l'écran vie privée
function openPrivacyScreen() {
  altScreenOn();
  DOM.$privacyMenu.classList.remove('d-none');
  DOM.$rech.value = "Vie privée";
  Globals.backButtonState = 'privacy';
}

function closePrivacyScreen(){
  altScreenOff();
  DOM.$privacyMenu.classList.add('d-none');
  Globals.backButtonState = 'default';
}

// Ouverture/fermeture de l'écran aller plus loin
function openPlusLoinScreen() {
  altScreenOn();
  DOM.$plusLoinMenu.classList.remove('d-none');
  Globals.backButtonState = 'plusLoin';
  DOM.$rech.value = "À découvrir également...";
}

function closePlusLoinScreen(){
  altScreenOff();
  DOM.$plusLoinMenu.classList.add('d-none');
  Globals.backButtonState = 'default';
}

export default {
  openLegend,
  closeLegend,
  openInfos,
  closeInfos,
  openParamsScreen,
  closeParamsScreen,
  openLegalScreen,
  closeLegalScreen,
  openPrivacyScreen,
  closePrivacyScreen,
  openPlusLoinScreen,
  closePlusLoinScreen,
  scrollTo,
  updateScrollAnchors,
};
