
/**
 * TeamBuilderBonuses - Motor independiente de bonos para el Team Builder
 *
 * Este módulo NO toca el DOM.
 * Solo expone una API basada en datos para que app.js pueda:
 *   1) Inicializar el motor con la configuración de bonos.
 *   2) Calcular, dado un set de titulares, qué bonos están activos
 *      y cuál sería el siguiente tramo de cada uno.
 *
 * Uso esperado (modo global):
 *
 *   // En un script que corre después de cargar las configs JSON:
 *   TeamBuilderBonuses.init({
 *     tagConfig: <contenido de tb-bonos-tags.json>,
 *     specialtyConfig: <contenido de tb-bonos-especialidad.json>,
 *     positionConfig: <contenido de tb-bonos-posicion.json>
 *   });
 *
 *   // Cada vez que cambien los titulares en el Team Builder:
 *   const result = TeamBuilderBonuses.compute({ titulares });
 *
 *   // result tiene la forma:
 *   // {
 *   //   specialtyCounts: { [tagKey]: count },
 *   //   positionCounts: { [positionKey]: count },
 *   //   specialtyStatus: { [tagKey]: { activeTier, nextTier, missing } },
 *   //   positionStatus: { [positionKey]: { activeTier, nextTier, missing } }
 *   // }
 *
 * Este archivo está pensado para ser lo más flexible posible con los datos:
 *
 * - De los jugadores (titulares) puede tomar:
 *   - specialtyTags: string[] ya canónicos (lo ideal).
 *   - O, si no existen, intentará usar:
 *     - tags: string[]
 *     - tagsRaw: string (separada por comas)
 *
 * - De la configuración de bonos se asume una estructura GENÉRICA:
 *   - tagConfig: lista de objetos tipo:
 *       { tagKey: "ataque_poderoso", aliases: ["Ataque Poderoso", "Poderoso"] }
 *
 *   - specialtyConfig: lista tipo:
 *       {
 *         tagKey: "ataque_poderoso",
 *         name: { es: "Ataque Poderoso" },
 *         tiers: [
 *           { requiredCount: 2, label: "+10% ATQ", ... },
 *           { requiredCount: 4, label: "+20% ATQ", ... }
 *         ]
 *       }
 *
 *   - positionConfig: lista tipo:
 *       {
 *         positionKey: "WS",
 *         name: { es: "Punta (WS)" },
 *         tiers: [
 *           { requiredCount: 2, label: "+X% algo", ... }
 *         ]
 *       }
 *
 * Si tus JSON tienen campos con nombres distintos, puedes:
 *   - Ajustar los nombres aquí en el módulo, o
 *   - Preprocesar sus contenidos antes de pasarlos a init().
 */

(function (global) {
  'use strict';

  const TeamBuilderBonuses = {
    // --- Estado interno ---
    _tagIndex: null,          // { aliasNormalizado -> tagKey }
    _tagMetaByKey: null,      // { tagKey -> objeto config de especialidad }
    _positionMetaByKey: null, // { positionKey -> objeto config de posición }
    _logger: null,            // función opcional para logs debug

    /**
     * Inicializa el motor de bonos.
     *
     * @param {Object} config
     * @param {Array}  config.tagConfig           Contenido de tb-bonos-tags.json
     * @param {Array}  config.specialtyConfig     Contenido de tb-bonos-especialidad.json
     * @param {Array}  config.positionConfig      Contenido de tb-bonos-posicion.json
     * @param {Function} [config.logger]          Función opcional para logs (console.log-like)
     */
    init: function init(config) {
      if (!config) {
        throw new Error('TeamBuilderBonuses.init requiere un objeto de configuración.');
      }

      const {
        tagConfig,
        specialtyConfig,
        positionConfig,
        logger
      } = config;

      this._logger = typeof logger === 'function' ? logger : null;

      this._buildTagIndex(tagConfig || []);
      this._buildSpecialtyMeta(specialtyConfig || []);
      this._buildPositionMeta(positionConfig || []);

      this._log('TeamBuilderBonuses inicializado.', {
        tags: Object.keys(this._tagIndex || {}),
        specialtyKeys: Object.keys(this._tagMetaByKey || {}),
        positionKeys: Object.keys(this._positionMetaByKey || {})
      });
    },

    /**
     * Calcula contadores y tramos activos/siguientes a partir de los titulares.
     *
     * @param {Object} params
     * @param {Array}  params.titulares   Lista de jugadores titulares.
     * @returns {Object}                  Objeto con counts y status.
     */
    compute: function compute(params) {
      params = params || {};
      const titulares = Array.isArray(params.titulares) ? params.titulares : [];

      const specialtyCounts = this._countSpecialties(titulares);
      const positionCounts = this._countPositions(titulares);

      const specialtyStatus = this._resolveAllSpecialtyStatus(specialtyCounts);
      const positionStatus = this._resolveAllPositionStatus(positionCounts);

      const result = {
        specialtyCounts,
        positionCounts,
        specialtyStatus,
        positionStatus
      };

      this._log('TeamBuilderBonuses.compute resultado', result);
      return result;
    },

    // ---------------------------------------------------------------------
    // Construcción de índices internos
    // ---------------------------------------------------------------------

    _buildTagIndex: function _buildTagIndex(tagConfig) {
      const index = Object.create(null);

      if (!Array.isArray(tagConfig)) {
        this._tagIndex = index;
        return;
      }

      tagConfig.forEach(entry => {
        if (!entry) return;
        const key = typeof entry.tagKey === 'string' ? entry.tagKey.trim() : null;
        if (!key) return;

        const aliases = Array.isArray(entry.aliases) ? entry.aliases.slice() : [];

        // También consideramos el propio tagKey como alias
        aliases.push(key);

        aliases.forEach(alias => {
          if (typeof alias !== 'string') return;
          const norm = normalizeString(alias);
          if (!norm) return;
          index[norm] = key;
        });
      });

      this._tagIndex = index;
    },

    _buildSpecialtyMeta: function _buildSpecialtyMeta(specialtyConfig) {
      const meta = Object.create(null);

      if (!Array.isArray(specialtyConfig)) {
        this._tagMetaByKey = meta;
        return;
      }

      specialtyConfig.forEach(entry => {
        if (!entry) return;
        const key = typeof entry.tagKey === 'string' ? entry.tagKey.trim() : null;
        if (!key) return;

        // Clon superficial para no mutar el original
        const clone = Object.assign({}, entry);

        // Normalizamos/sort de tiers según requiredCount o minCount
        if (Array.isArray(clone.tiers)) {
          clone.tiers = clone.tiers.slice().sort((a, b) => {
            const ca = getTierRequiredCount(a);
            const cb = getTierRequiredCount(b);
            return ca - cb;
          });
        } else {
          clone.tiers = [];
        }

        meta[key] = clone;
      });

      this._tagMetaByKey = meta;
    },

    _buildPositionMeta: function _buildPositionMeta(positionConfig) {
      const meta = Object.create(null);

      if (!Array.isArray(positionConfig)) {
        this._positionMetaByKey = meta;
        return;
      }

      positionConfig.forEach(entry => {
        if (!entry) return;
        const key = typeof entry.positionKey === 'string'
          ? entry.positionKey.trim()
          : (typeof entry.key === 'string' ? entry.key.trim() : null);
        if (!key) return;

        const upperKey = key.toUpperCase();

        const clone = Object.assign({}, entry);

        if (Array.isArray(clone.tiers)) {
          clone.tiers = clone.tiers.slice().sort((a, b) => {
            const ca = getTierRequiredCount(a);
            const cb = getTierRequiredCount(b);
            return ca - cb;
          });
        } else {
          clone.tiers = [];
        }

        meta[upperKey] = clone;
      });

      this._positionMetaByKey = meta;
    },

    // ---------------------------------------------------------------------
    // Contadores
    // ---------------------------------------------------------------------

    _countSpecialties: function _countSpecialties(titulares) {
      const counts = Object.create(null);

      titulares.forEach(player => {
        if (!player) return;
        const tags = this._getPlayerSpecialtyTags(player);
        if (!tags || !tags.length) return;

        tags.forEach(tagKey => {
          if (!tagKey) return;
          if (typeof counts[tagKey] !== 'number') counts[tagKey] = 0;
          counts[tagKey] += 1;
        });
      });

      return counts;
    },

    _countPositions: function _countPositions(titulares) {
      const counts = Object.create(null);

      titulares.forEach(player => {
        if (!player) return;
        const posKey = this._getPlayerPositionKey(player);
        if (!posKey) return;

        if (typeof counts[posKey] !== 'number') counts[posKey] = 0;
        counts[posKey] += 1;
      });

      return counts;
    },

    _getPlayerSpecialtyTags: function _getPlayerSpecialtyTags(player) {
      // 1) Si ya viene con specialtyTags canónicos, usamos eso directamente.
      if (Array.isArray(player.specialtyTags)) {
        return player.specialtyTags.filter(Boolean);
      }

      // 2) Si no, intentamos inferir desde otros campos más "crudos"
      let rawTags = null;

      if (Array.isArray(player.tags)) {
        rawTags = player.tags.slice();
      } else if (typeof player.tagsRaw === 'string') {
        rawTags = player.tagsRaw.split(','); // luego se hará trim/normalize
      } else if (typeof player.tags_string === 'string') {
        rawTags = player.tags_string.split(',');
      }

      if (!rawTags || !rawTags.length) {
        return [];
      }

      const result = [];
      rawTags.forEach(t => {
        if (typeof t !== 'string') return;
        const norm = normalizeString(t);
        if (!norm) return;
        const key = this._tagIndex && this._tagIndex[norm];
        if (key && result.indexOf(key) === -1) {
          result.push(key);
        }
      });

      return result;
    },

    _getPlayerPositionKey: function _getPlayerPositionKey(player) {
      // Intentamos varios campos comunes
      let raw =
        player.positionKey ||
        player.position ||
        player.pos ||
        player.role ||
        null;

      if (typeof raw !== 'string') return null;

      const trimmed = raw.trim();
      if (!trimmed) return null;

      return trimmed.toUpperCase();
    },

    // ---------------------------------------------------------------------
    // Resolución de tramos activos / siguientes
    // ---------------------------------------------------------------------

    _resolveAllSpecialtyStatus: function _resolveAllSpecialtyStatus(counts) {
      const status = Object.create(null);

      const meta = this._tagMetaByKey || {};
      Object.keys(meta).forEach(tagKey => {
        const count = typeof counts[tagKey] === 'number' ? counts[tagKey] : 0;
        status[tagKey] = this._resolveBonusForMeta(count, meta[tagKey]);
      });

      return status;
    },

    _resolveAllPositionStatus: function _resolveAllPositionStatus(counts) {
      const status = Object.create(null);

      const meta = this._positionMetaByKey || {};
      Object.keys(meta).forEach(positionKey => {
        const count = typeof counts[positionKey] === 'number' ? counts[positionKey] : 0;
        status[positionKey] = this._resolveBonusForMeta(count, meta[positionKey]);
      });

      return status;
    },

    /**
     * Dado un contador y una entrada meta (con tiers), devuelve:
     *   { activeTier, nextTier, missing }
     *
     * - activeTier: último tier cuyo requiredCount <= count (o null).
     * - nextTier: primer tier cuyo requiredCount > count (o null).
     * - missing: cuánto falta para nextTier (0 si no hay nextTier).
     */
    _resolveBonusForMeta: function _resolveBonusForMeta(count, meta) {
      const tiers = Array.isArray(meta && meta.tiers) ? meta.tiers : [];

      let activeTier = null;
      let nextTier = null;

      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const needed = getTierRequiredCount(tier);

        if (needed <= count) {
          activeTier = tier;
        } else {
          nextTier = tier;
          break;
        }
      }

      let missing = 0;
      if (nextTier) {
        const neededNext = getTierRequiredCount(nextTier);
        missing = Math.max(0, neededNext - count);
      }

      return {
        activeTier: activeTier || null,
        nextTier: nextTier || null,
        missing: missing
      };
    },

    // ---------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------

    _log: function _log(message, payload) {
      if (!this._logger) return;
      try {
        this._logger(message, payload);
      } catch (e) {
        // ignoramos errores de logger para no romper la app
      }
    }
  };

  // -----------------------------------------------------------------------
  // Helpers internos (fuera del objeto principal)
  // -----------------------------------------------------------------------

  /**
   * Normaliza un string:
   * - a minúsculas
   * - sin tildes
   * - trim
   */
  function normalizeString(str) {
    if (typeof str !== 'string') return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Obtiene el "requiredCount" de un tier de forma flexible.
   * Intenta varios nombres de campo comunes.
   */
  function getTierRequiredCount(tier) {
    if (!tier || typeof tier !== 'object') return 0;

    if (typeof tier.requiredCount === 'number') return tier.requiredCount;
    if (typeof tier.minCount === 'number') return tier.minCount;
    if (typeof tier.count === 'number') return tier.count;

    // fallback por si viene como string
    if (typeof tier.requiredCount === 'string') return parseInt(tier.requiredCount, 10) || 0;
    if (typeof tier.minCount === 'string') return parseInt(tier.minCount, 10) || 0;
    if (typeof tier.count === 'string') return parseInt(tier.count, 10) || 0;

    return 0;
  }

  // Exponemos en el objeto global
  global.TeamBuilderBonuses = TeamBuilderBonuses;

})(typeof window !== 'undefined' ? window : this);
