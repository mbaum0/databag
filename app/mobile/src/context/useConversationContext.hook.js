import { useState, useEffect, useRef, useContext } from 'react';
import { StoreContext } from 'context/StoreContext';
import { CardContext } from 'context/CardContext';
import { ChannelContext } from 'context/ChannelContext';
import { ProfileContext } from 'context/ProfileContext';
import moment from 'moment';

export function useConversationContext() {
  const [state, setState] = useState({
    topic: null,
    subject: null,
    logo: null,
    revision: null,
    contacts: [],
    topics: new Map(),
    created: null,
    host: null,
  });
  const store = useContext(StoreContext);
  const card = useContext(CardContext);
  const channel = useContext(ChannelContext);
  const profile = useContext(ProfileContext);
  const topics = useRef(null);
  const revision = useRef(0);
  const force = useRef(false);
  const detailRevision = useRef(0);
  const syncing = useRef(false);
  const conversationId = useRef(null);
  const reset = useRef(false);
  const setView = useRef(0);

  const updateState = (value) => {
    setState((s) => ({ ...s, ...value }))
  }

  const getTopicItems = async (cardId, channelId) => {
    if (cardId) {
      return await card.actions.getChannelTopicItems(cardId, channelId);
    }
    return await channel.actions.getTopicItems(channelId);
  }
  const setTopicItem = async (cardId, channelId, topic) => {
    if (cardId) {
      return await card.actions.setChannelTopicItem(cardId, channelId, topic);
    }
    return await channel.actions.setTopicItem(channelId, topic);
  }
  const clearTopicItem = async (cardId, channelId, topicId) => {
    if (cardId) {
      return await card.actions.clearChannelTopicItem(cardId, channelId, topicId);
    }
    return await channel.actions.clearTopicItem(channelId, topicId);
  }
  const getTopic = async (cardId, channelId, topicId) => {
    if (cardId) {
      return await card.actions.getChannelTopic(cardId, channelId, topicId);
    }
    return await channel.actions.getTopic(channelId, topicId);
  }
  const getTopics = async (cardId, channelId, revision) => {
    if (cardId) {
      return await card.actions.getChannelTopics(cardId, channelId, revision);
    }
    return await channel.actions.getTopics(channelId, revision)
  }
  const getTopicAssetUrl = (cardId, channelId, assetId) => {
    if (cardId) {
      return card.actions.getChannelTopicAssetUrl(cardId, channelId, topicId, assetId);
    }
    return channel.actions.getTopicAssetUrl(channelId, assetId);
  }
  const addTopic = async (cardId, channelId, message, asssets) => {
    if (cardId) {
      return await card.actions.addChannelTopic(cardId, channelId, message, assetId);
    }
    return await channel.actions.addTopic(channelId, message, assetId);
  }
  const setTopicSubject = async (cardId, channelId, topicId, data) => {
    if (cardId) {
      return await card.actions.setChannelTopicSubject(cardId, channelId, topicId, data);
    }
    return await channel.actions.setTopicSubject(channelId, topicId, data);
  }
  const remove = async (cardId, channelId) => {
    if (cardId) {
      return await card.actions.removeChannel(cardId, channelId);
    }
    return await channel.actions.remove(channelId);
  }
  const removeTopic = async (cardId, channelId, topicId) => {
    if (cardId) {
      return await card.actions.removeChannelTopic(cardId, channelId, topicId);
    }
    return await channel.actions.remvoeTopic(channelId, topicId);
  }
  const setSyncRevision = async (cardId, channelId, revision) => {
    if (cardId) {
      return await card.actions.setSyncRevision(cardId, channelId, revision);
    }
    return await channel.actions.setSyncRevision(channelId, revision);
  }

  const sync = async () => {
    const curView = setView.current;
    if (!syncing.current) {
      if (reset.current) {
        revision.current = null;
        detailRevision.current = null;
        topics.current = null;
        reset.current = false;
      }
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        const channelItem = getChannel(cardId, channelId);
        if (channelItem && (channelItem.revision !== revision.current || force.current)) {
          syncing.current = true;

          try {
            // set channel details
            if (detailRevision.current != channelItem.detailRevision) {
              if (curView === setView.current) {
                setChannel(channelItem);
                detailRevision.current = channelItem.detailRevision;
              }
            }

            // initial load from store
            if (!topics.current) {
              topics.current = new Map();
              const items = await getTopicItems(cardId, channelId);
              items.forEach(item => {
                topics.current.set(item.topicId, item);
              });
            }

            // sync from server
            if (channelItem.topicRevision != channelItem.syncRevision || force.current) {
              force.current = false;
              const res = await getTopics(cardId, channelId, channelItem.syncRevision)
              for (const topic of res.topics) {
                if (!topic.data) {
                  topics.current.delete(topic.id);
                  await clearTopicItem(cardId, channelId, topic.id);
                }
                else {
                  const cached = topics.current.get(topic.id);
                  if (!cached || cached.detailRevision != topic.data.detailRevision) {
                    if (!topic.data.topicDetail) {
                      const updated = await getTopic(cardId, channelId, topic.id);
                      topic.data = updated.data;
                    }
                    if (!topic.data) {
                      topics.current.delete(topic.id);
                      await clearTopicItem(cardId, channelId, topic.id);
                    }
                    else {
                      await setTopicItem(cardId, channelId, topic);
                      const { id, revision, data } = topic;
                      topics.current.set(id, { topicId: id, revision: revision, detailRevision: topic.data.detailRevision, detail: topic.data.topicDetail }); 
                    }
                  }
                }
              }
              await setSyncRevision(cardId, channelId, res.revision);
            }

            // update revision
            revision.current = channelItem.revision;
            if (curView == setView.current) {
              if (cardId) {
                card.actions.setChannelReadRevision(cardId, channelId, revision.current);
              }
              else {
                channel.actions.setReadRevision(channelId, revision.current);
              }
              updateState({ topics: topics.current });
            }

            syncing.current = false;
            sync();
          }
          catch(err) {
            console.log(err);
            syncing.current = false;
            //TODO set to unsynced state
          }
        }
      }
    }
  }

  const getCard = (guid) => {
    let contact = null
    card.state.cards.forEach((card, cardId, map) => {
      if (card?.profile?.guid === guid) {
        contact = card;
      }
    });
    return contact;
  }

  const getChannel = (cardId, channelId) => {
    if (cardId) {
      const entry = card.state.cards.get(cardId);
      return entry?.channels.get(channelId);
    }
    return channel.state.channels.get(channelId);
  }

  const setChannel = (item) => {
    let contacts = [];
    let logo = null;
    let topic = null;
    let subject = null;

    let timestamp;
    const date = new Date(item.detail.created * 1000);
    const now = new Date();
    const offset = now.getTime() - date.getTime();
    if(offset < 86400000) {
      timestamp = moment(date).format('h:mma');
    }
    else if (offset < 31449600000) {
      timestamp = moment(date).format('M/DD');
    }
    else {
      timestamp = moment(date).format('M/DD/YYYY');
    }

    if (!item) {
      updateState({ contacts, logo, subject, topic });
      return;
    }

    if (item.cardId) {
      contacts.push(card.state.cards.get(item.cardId));
    }
    if (item?.detail?.members) {
      const profileGuid = profile.state.profile.guid;
      item.detail.members.forEach(guid => {
        if (profileGuid !== guid) {
          const contact = getCard(guid);
          contacts.push(contact);
        }
      })
    }

    if (contacts.length === 0) {
      logo = 'solution';
    }
    else if (contacts.length === 1) {
      if (contacts[0]?.profile?.imageSet) {
        logo = card.actions.getCardLogo(contacts[0].cardId, contacts[0].profileRevision);
      }
      else {
        logo = 'avatar';
      }
    }
    else {
      logo = 'appstore';
    }

    if (item?.detail?.data) {
      try {
        topic = JSON.parse(item?.detail?.data).subject;
        subject = topic;
      }
      catch (err) {
        console.log(err);
      }
    }
    if (!subject) {
      if (contacts.length) {
        let names = [];
        for (let contact of contacts) {
          if (contact?.profile?.name) {
            names.push(contact.profile.name);
          }
          else if (contact?.profile?.handle) {
            names.push(contact?.profile?.handle);
          }
        }
        subject = names.join(', ');
      }
      else {
        subject = "Notes";
      }
    }

    updateState({ topic, subject, logo, contacts, host: item.cardId, created: timestamp });
  }

  useEffect(() => {
    sync();
  }, [card, channel]);

  const actions = {
    setChannel: (selected) => {
      if (selected == null) {
        setView.current++;
        conversationId.current = null;
        reset.current = true;
        updateState({ subject: null, logo: null, contacts: [], topics: new Map() });
      }
      else if (selected.cardId !== conversationId.current?.cardId || selected.channelId !== conversationId.current?.channelId) {
        setView.current++;
        conversationId.current = selected;
        reset.current = true;
        updateState({ subject: null, logo: null, contacts: [], topics: new Map() });
        sync();
        const { cardId, channelId, revision } = selected;
        if (cardId) {
          card.actions.setChannelReadRevision(cardId, channelId, revision);
        }
        else {
          channel.actions.setReadRevision(channelId, revision);
        }
      }
    },
    getTopicAssetUrl: (topicId, assetId) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          return card.actions.getChannelTopicAssetUrl(cardId, channelId, topicId, assetId);
        }
        else {
          return channel.actions.getTopicAssetUrl(channelId, topicId, assetId);
        }
      }
      return null;
    },
    addTopic: async (message, files) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          await card.actions.addChannelTopic(cardId, channelId, message, files);
        }
        else {
          await channel.actions.addTopic(channelId, message, files);
        }
        force.current = true;
        sync();
      }
    },
    setSubject: async (subject) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          throw new Error("can only set hosted channel subjects");
        }
        await channel.actions.setSubject(channelId, subject);
      }
    },
    remove: async () => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        await remove(cardId, channelId);
      }
    },
    removeTopic: async (topicId) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          await card.actions.removeChannelTopic(cardId, channelId, topicId);
        }
        else {
          await channel.actions.removeTopic(channelId, topicId);
        }
        force.current = true;
        sync();
      }
    },
    setTopicSubject: async (topicId, data) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          return await card.actions.setChannelTopicSubject(cardId, channelId, topicId, data);
        }
        else {
          return await channel.actions.setTopicSubject(channelId, topicId, data);
        }
      }
      force.current = true;
      sync();
    },
    setCard: async (id) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          throw new Error("can only set members on hosted channel");
        }
        await channel.actions.setCard(channelId, id);
      }
    },
    clearCard: async (id) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          throw new Error("can only clear members on hosted channel");
        }
        await channel.actions.clearCard(channelId, id);
      }
    },
    setBlocked: async () => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          await card.actions.setChannelBlocked(cardId, channelId);
        }
        else {
          await channel.actions.setBlocked(channelId);
        }
      }
    },
    blockTopic: async (topicId) => {
      if (conversationId.current) {
        const { cardId, channelId } = conversationId.current;
        if (cardId) {
          await card.actions.setChannelTopicBlocked(cardId, channelId, topicId);
        }
        else {
          await channel.actions.setTopicBlocked(channelId, topicId);
        }
        const topic = topics.current.get(topicId);
        if (topic) {
          topic.blocked = 1;
          force.current = true;
          sync();
        }
      }
    },
    unblockTopic: async (cardId, channelId, topicId) => {
      if (conversationId.current) {
        if (conversationId.current.cardId == cardId && conversationId.current.channelId == channelId) {
          const topic = topics.current.get(topicId);
          if (topic) {
            topic.blocked = 0;
            force.current = true;
            sync();
          }
        }
      }
    }
  }

  return { state, actions }
}

