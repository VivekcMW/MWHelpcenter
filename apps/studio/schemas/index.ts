import {article, author, collection, homePage, product, redirect, siteSettings} from './documents'
import {animatedImageWithCaption, audioWithTranscript, callout, codeBlock, downloadableFile, imageWithCaption, procedure, richContent, simpleTable, videoWithCaption} from './richContent'

export const schemaTypes = [homePage, siteSettings, product, collection, article, author, redirect, richContent, callout, imageWithCaption, animatedImageWithCaption, videoWithCaption, audioWithTranscript, downloadableFile, procedure, simpleTable, codeBlock]