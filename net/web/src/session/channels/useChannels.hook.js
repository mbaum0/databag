import { useContext, useState, useRef, useEffect } from 'react';
import { StoreContext } from 'context/StoreContext';
import { ChannelContext } from 'context/ChannelContext';
import { CardContext } from 'context/CardContext';
import { AccountContext } from 'context/AccountContext';
import { ViewportContext } from 'context/ViewportContext';
import { ProfileContext } from 'context/ProfileContext';
import { getCardByGuid } from 'context/cardUtil';
import { isUnsealed, getChannelSeals, getContentKey, decryptChannelSubject } from 'context/sealUtil';

export function useChannels() {

  const [filter, setFilter] = useState();

  const [state, setState] = useState({
    display: null,
    channels: [],
    sealable: false,
    busy: false,

    showAdd: false,
    subject: null,
    members: new Set(),
    seal: false,
  });

  const profile = useContext(ProfileContext);
  const card = useContext(CardContext);
  const channel = useContext(ChannelContext);
  const account = useContext(AccountContext);
  const store = useContext(StoreContext);
  const viewport = useContext(ViewportContext);

  const channels = useRef(new Map());

  const updateState = (value) => {
    setState((s) => ({ ...s, ...value }));
  }

  const syncChannelDetail = (item, cardValue, channelValue) => {

    // extract member info
    let memberCount = 0;
    let names = [];
    let img = null;
    let logo = null;
    if (cardValue) {
      const profile = cardValue?.data?.cardProfile;
      if (profile?.name) {
        names.push(profile.name);
      }
      if (profile?.imageSet) {
        img = null;
        logo = card.actions.getCardImageUrl(cardValue.data.profileRevision);
      }
      else {
        img = 'avatar';
        logo = null;
      }
      memberCount++;
    }
    for (let guid of channelValue?.data?.channelDetail?.members) {
      if (guid !== profile.state.identity.guid) {
        const contact = getCardByGuid(card.state.cards, guid);
        const profile = contact?.data?.cardProfile;
        if (profile?.name) {
          names.push(profile.name);
        }
        if (profile?.imageSet) {
          img = null;
          logo = card.actions.getCardImageUrl(contact.id);
        }
        else {
          img = 'avatar';
          logo = null;
        }
        memberCount++;
      }
    }

    // set logo and label
    if (memberCount === 0) {
      item.img = 'solution';
      item.label = 'Notes';
    }
    else if (memberCount === 1) {
      item.logo = logo;
      item.img = img;
      item.label = names.join(',');
    }
    else {
      item.img = 'appstore';
      item.label = names.join(',');
    }

    // set subject
    const detail = channelValue.data?.channelDetail;
    if (detail?.dataType === 'sealed') {
      item.locked = true;
      try {
        const { sealKey } = account.state;
        const seals = getChannelSeals(detail.data);
        if (isUnsealed(seals, sealKey)) {
          item.unlocked = true;
          if (!item.contentKey) {
            item.contentKey = getContentKey(seals, sealKey);
          }
          const unsealed = decryptChannelSubject(detail.data, item.contentKey);
          item.subject = unsealed?.subject;
        }
        else {
          item.unlocked = false;
          item.contentKey = null;
        }
      }
      catch(err) {
        console.log(err);
        item.unlocked = false;
      }
    }
    else if (detail?.dataType === 'superbasic') {
      item.locked = false;
      item.unlocked = true;
      try {
        const data = JSON.parse(detail.data);
        item.subject = data.subject;
      }
      catch(err) {
        console.log(err);
      }
    }
    if (item.subject == null) {
      item.subject = item.label;
    }

    // set updated revision
    item.detailRevision = channelValue.data.detailRevision;
  }

  const syncChannelSummary = (item, channelValue) => {
    item.updated = channelValue.data?.channelSummary?.lastTopic?.created;

    // set updated revision
    item.topicRevision = channelValue.data.topicRevision;
  };

  useEffect(() => {
    const { seal, sealKey } = account.state;
    if (seal?.publicKey && sealKey?.public && sealKey?.private && seal.publicKey === sealKey.public) {
      updateState({ seal: false, sealable: true });
    }
    else {
      updateState({ seal: false, sealable: false });
    }
  }, [account.state]);

  useEffect(() => {
    const login = store.state['login:timestamp'];
    const conversations = new Map();
    const { sealKey } = account.state;
    card.state.cards.forEach((cardValue, cardId) => {
      cardValue.channels.forEach((channelValue, channelId) => {
        const key = `${channelId}::${cardId}`;
        const { detailRevision, topicRevision } = channelValue.data;
        let item = channels.current.get(key);
        if (!item) {
          item = { cardId, channelId };
        }
        if (item.detailRevision !== detailRevision ||
            item.sealKey !== sealKey) {
          syncChannelDetail(item, cardValue, channelValue);
        }
        if (item.topicRevision !== topicRevision ||
            item.sealKey !== sealKey) {
          syncChannelSummary(item, channelValue);
        }
        item.sealKey = sealKey;
        const revision = store.state[key];
console.log("> ", channelValue.id, topicRevision, revision);
        if (login && item.updated && item.updated > login && topicRevision !== revision) {
          item.updatedFlag = true;
        }
        else {
          item.updatedFlag = false;
        }
        conversations.set(key, item);
      });
    });
    channel.state.channels.forEach((channelValue, channelId) => {
      const key = `${channelId}::${undefined}`;
      const { detailRevision, topicRevision } = channelValue.data;
      let item = channels.current.get(key);
      if (!item) {
        item = { channelId };
      }
      if (item.detailRevision !== detailRevision ||
          item.sealKey !== sealKey) {
        syncChannelDetail(item, null, channelValue);
      }
      if (item.topicRevision !== topicRevision ||
          item.sealKey !== sealKey) {
        syncChannelSummary(item, channelValue);
      }
      item.sealKey = sealKey;
      const revision = store.state[key];
console.log("> ", channelValue.id, topicRevision, revision);
      if (login && item.updated && item.updated > login && topicRevision !== revision) {
        item.updatedFlag = true;
      }
      else {
        item.updatedFlag = false;
      }
      conversations.set(key, item);
    });
    channels.current = conversations;

    const merged = Array.from(conversations.values());
    merged.sort((a, b) => {
      const aUpdated = a.updated;
      const bUpdated = b.updated;
      if (aUpdated === bUpdated) {
        return 0;
      }
      if (!aUpdated || aUpdated < bUpdated) {
        return 1;
      }
      return -1;
    });

    const filtered = merged.filter((item) => {
      const subject = item.subject?.toUpperCase();
      return !filter || subject?.includes(filter);    
    });

    updateState({ channels: filtered });

    // eslint-disable-next-line
  }, [account.state, store.state, card.state, channel.state, filter]);

  useEffect(() => {
    updateState({ display: viewport.state.display });
  }, [viewport]);

  const actions = {
    addChannel: async () => {
      let added;
      if (!state.busy) {
        try {
          updateState({ busy: true });
          const cards = Array.from(state.members.values());
          if (state.seal) {
            const keys = [ account.state.sealKey.public ];
            cards.forEach(id => {
              keys.push(card.state.cards.get(id).data.cardProfile.seal);
            });
            added = await channel.actions.addSealedChannel(cards, state.subject, keys);
          }
          else {
            added = await channel.actions.addBasicChannel(cards, state.subject);
          }
          updateState({ busy: false });
        }
        catch(err) {
          console.log(err);
          updateState({ busy: false });
          throw new Error("failed to create new channel");
        }
      }
      else {
        throw new Error("operation in progress");
      }
      return added.id;
    },
    setSeal: (seal) => {
      if (seal) {
        const cards = Array.from(state.members.values());
        const members = new Set(state.members);
        cards.forEach(id => {
          if (!(card.state.cards.get(id)?.data?.cardProfile?.seal)) {
            members.delete(id);
          }    
        });
        updateState({ seal: true, members });
      }
      else {
        updateState({ seal: false });
      }
    },
    onFilter: (value) => {
      updateState({ filter: value.toUpperCase() });
    },
    setShowAdd: () => {
      updateState({ showAdd: true, seal: false, members: new Set(), subject: null });
    },
    clearShowAdd: () => {
      updateState({ showAdd: false });
    },
    onMember: (string) => {
      const members = new Set(state.members);
      if (members.has(string)) {
        members.delete(string);
      }
      else {
        members.add(string);
      }
      updateState({ members });
    },
    setSubject: (subject) => {
      updateState({ subject });
    },
    cardFilter: (card) => {
      if (state.seal) {
        return card?.data?.cardDetail?.status === 'connected' && card?.data?.cardProfile?.seal;
      }
      return card?.data?.cardDetail?.status === 'connected';
    },
  };

  return { state, actions };
}
