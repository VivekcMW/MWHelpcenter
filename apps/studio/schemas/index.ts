import {article, author, collection, product, redirect, siteSettings} from './documents'
import {callout, imageWithCaption, procedure, richContent, simpleTable} from './richContent'

export const schemaTypes = [product, collection, article, author, siteSettings, redirect, richContent, callout, imageWithCaption, procedure, simpleTable]