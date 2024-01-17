import { Toast } from '@capacitor/toast';

import utils from '../unit-utils';
import DomUtils from '../dom-utils';

import Sortable from 'sortablejs';

/**
 * DOM de la fenêtre de compte
 * @mixin MyAccountDOM
 */
let MyAccountDOM = {
  dom: {
    container: null,
    routeTab: null,
    routeNumber: null,
    landmarkNumber: null,
    landmarkTab: null,
    routeList: null,
  },

  /**
   * obtenir le container principal
   * @param {*} accountName
   * @param {*} routes
   * @returns {DOMElement}
   * @public
   */
  getContainer(accountName, routes) {
    // nettoyage
    if (this.dom.container) {
      this.dom.container.remove();
    }
    // ajout du container principal
    var container = this.__addAccountContainerDOMElement(accountName);
    container.appendChild(this.__addTabsContainerDOMElement());
    // ajout des itinéraires
    this.dom.routeList = this.__addAccountRoutesContainerDOMElement(routes);
    // dragn'drop !
    Sortable.create(this.dom.routeList, {
      handle: ".handle-draggable-layer",
      draggable: ".draggable-layer",
      animation: 200,
      forceFallback: true,
      onEnd : (evt) => {
        this.setRoutePosition(evt.oldDraggableIndex, evt.newDraggableIndex);
      }
    });
    this.dom.routeTab.appendChild(this.dom.routeList);

    return container;
  },

  /**
   * ajout du container principal
   * @returns {DOMElement}
   * @private
   */
  __addAccountContainerDOMElement(accountName) {
    var div = this.dom.container = document.createElement("div");
    div.id = "myAccountBody";
    div.className = "";
    var bodyHeader = document.createElement("p");
    bodyHeader.id = "myAccountHeaderName";
    var connected = true;
    if (!accountName) {
      accountName = "Non connecté";
      connected = false;
    }
    bodyHeader.innerText = accountName;
    div.appendChild(bodyHeader);

    if (!connected) {
      var notLoggedInWarn = document.createElement("p");
      notLoggedInWarn.id = "myAccountNotLoggedInWarn";
      notLoggedInWarn.innerText = "Les itinéraires enregistrés peuvent être perdus";
      div.appendChild(notLoggedInWarn);

      var logInBtn = document.createElement("div");
      logInBtn.id = "myAccountLogInBtn";
      logInBtn.innerText = "Se connecter";
      div.appendChild(logInBtn);

      logInBtn.addEventListener("click", () => {
        console.warn("GPF auth not implemented");
      })
    } else {
      var logOutBtn = document.createElement("div");
      logOutBtn.id = "myAccountLogOutBtn";
      logOutBtn.innerText = "Se déconnecter";
      div.appendChild(logOutBtn);
    }

    return div;
  },

  /**
   * ajout du container des onglets
   * @returns {DOMElement}
   * @private
   */
  __addTabsContainerDOMElement() {
    var tplContainer = `
    <div class="layer-tabs-wrap">
      <input class="layer-tabs-input" name="myaccount-tabs" type="radio" id="myaccount-routes-tab" checked="checked"/>
      <label class="layer-tabs-label" for="myaccount-routes-tab">Mes itinéraires <span id="myaccount-routes-number">0</span></label>
      <input class="layer-tabs-input" name="myaccount-tabs" type="radio" id="myaccount-landmarks-tab"/>
      <label class="layer-tabs-label" for="myaccount-landmarks-tab">Mes points de repère <span id="myaccount-landmarks-number">0</span></label>
      <div class="layer-tabs-content" id="myaccount-routes"></div>
      <div class="layer-tabs-content" id="myaccount-landmarks"></div>
    </div>`
    // transformation du container : String -> DOM
    var container = DomUtils.stringToHTML(tplContainer.trim());
    this.dom.routeTab = container.querySelector("#myaccount-routes");
    this.dom.routeNumber = container.querySelector("#myaccount-routes-number");
    this.dom.landmarkTab = container.querySelector("#myaccount-landmarks");
    this.dom.landmarkNumber = container.querySelector("#myaccount-landmarks-number");
    return container;
  },

  /**
   * ajoute le container sur les itinéraires
   * @param {*} routes
   * @returns {DOMElement}
   * @private
   */
  __addAccountRoutesContainerDOMElement(routes) {
    var divList = this.dom.container = document.createElement("div");
    divList.id = "myaccountRouteList";
    for (let i = 0; i < routes.length; i++) {
      divList.appendChild(this.__addRouteContainer(routes[i], i));
    }
    this.dom.routeNumber.innerText = routes.length;
    return divList;
  },

  /**
   * met à jour le container sur les itinéraires
   * @param {*} routes
   * @private
   */
  __updateAccountRoutesContainerDOMElement(routes) {
    this.dom.routeList.innerHTML = "";
    for (let i = 0; i < routes.length; i++) {
      this.dom.routeList.appendChild(this.__addRouteContainer(routes[i], i));
    }
    this.dom.routeNumber.innerText = routes.length;
  },

  /**
   * Ajout d'une entrée pour une route (DOM)
   * @param {*} route
   * @private
   */
  __addRouteContainer(route) {
    var title = route.name;
    var routeId = route.id;
    var checked = route.visible ? "checked" : "";

    // Template d'une route
    var tplContainer = `
      <div class="tools-layer-panel draggable-layer" id="route-container_ID_${routeId}">
        <div class="handle-draggable-layer" id="route-cross-picto_ID_${routeId}"></div>
        <div id="route-basic-tools_ID_${routeId}">
          <label class="routeDrawSummaryTransport lblRouteDrawSummaryTransport${route.transport}"></label>
          <div class="wrap-tools-layers">
            <span id="route-title_ID_${routeId}">${title}</span>
            <div id="route-summary-div_ID_${routeId}" class="tools-layer-summary">
              <label class="routeDrawSummaryDistance">${utils.convertDistance(route.data.distance)}</label>
              <label class="routeDrawSummaryDuration">${utils.convertSecondsToTime(route.data.duration)}</label>
              <label class="routeDrawSummaryDPlus">${route.data.elevationData.dplus} m</label>
            </div>
          </div>
        </div>
        <label id="route-show-advanced-tools_ID_${routeId}" title="Plus d'outils" class="tools-layer-advanced"></label>
        <div id="route-advanced-tools_ID_${routeId}" class="tools-layer-advanced-menu">
          <div id="route-share_ID_${routeId}" class="tools-layer-share" title="Partager l'itinéraire">Partager</div>
          <input type="checkbox" id="route-visibility_ID_${routeId}" ${checked}/>
          <label id="route-visibility-picto_ID_${routeId}" for="route-visibility_ID_${routeId}" title="Afficher/masquer l'itinéraire'" class="tools-layer-visibility">Afficher/masquer</label>
          <div id="route-edit_ID_${routeId}" class="tools-layer-edit" title="Modifier l'itinéraire">Modifier</div>
          <div id="route-export_ID_${routeId}" class="tools-layer-export" title="Exporter l'itinéraire">Exporter</div>
          <div id="route-remove_ID_${routeId}" class="tools-layer-remove" title="Supprimer l'itinéraire'">Supprimer</div>
        </div>
      </div>
      `;

    // transformation du container : String -> DOM
    var container = DomUtils.stringToHTML(tplContainer.trim());

    container.querySelector(`#route-share_ID_${routeId}`).addEventListener("click", () => {
      this.shareRoute(route);
    });

    container.querySelector(`#route-export_ID_${routeId}`).addEventListener("click", () => {
      this.exportRoute(route);
    });

    container.querySelector(`#route-visibility_ID_${routeId}`).addEventListener("click", () => {
      this.toggleShowRoute(route);
    });

    container.querySelector(`#route-edit_ID_${routeId}`).addEventListener("click", () => {
      this.editRoute(route);
    });

    let deleteRoute = () => {
      this.deleteRoute(routeId);
    }

    let handleDeleteRoute = deleteRoute.bind(this)

    container.querySelector(`#route-remove_ID_${routeId}`).addEventListener("click", () => {
      Toast.show({
        text: "Confirmez la suppression de l'itinéraire",
        duration: "short",
        position: "bottom"
      });
      container.querySelector(`#route-remove_ID_${routeId}`).addEventListener("click", handleDeleteRoute);
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest(`#route-remove_ID_${routeId}`)) {
        container.querySelector(`#route-remove_ID_${routeId}`).removeEventListener("click", handleDeleteRoute);
    }
    });

    if (!container) {
      console.warn();
      return;
    }
    return container;
  }
};

export default MyAccountDOM;